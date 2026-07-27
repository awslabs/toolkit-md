/**
 * Copyright 2025 Amazon.com, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  BedrockRuntimeClient,
  type CachePointType,
  type ConversationRole,
  ConverseCommand,
  CountTokensCommand,
  type ImageFormat,
  type Message,
  type Tool,
  type ToolChoice,
  type ToolResultBlock,
} from "@aws-sdk/client-bedrock-runtime";
import type { DocumentType } from "@smithy/types";
import { z } from "zod";
import type { Prompt } from "../prompts/index.js";
import {
  NoopRateLimiter,
  type RateLimiter,
  SlidingLogRateLimiter,
} from "./rateLimiting/index.js";
import type {
  AgentTool,
  BedrockClient,
  BedrockClientGenerateResponse,
  GenerateWithToolsOptions,
  GenerateWithToolsResponse,
  ToolOutcome,
} from "./types.js";
import { TokenUsageCounter } from "./utils.js";

const DEFAULT_MAX_TURNS = 10;

const USER_AGENT = process.env.TKMD_AI_USER_AGENT || "toolkit-md";

/**
 * Converts a Bedrock model identifier to its underlying foundation model ID by
 * stripping any cross-region inference profile prefix (e.g. "global.", "us.",
 * "eu.", "apac.").
 *
 * The CountTokens operation only accepts foundation model IDs and rejects
 * inference profile IDs, whereas Converse requires the profile form. This lets
 * a single configured model ID drive both calls.
 *
 * @param modelId - The configured model identifier, which may be an inference profile ID
 * @returns The foundation model ID with any geographic profile prefix removed
 */
function toFoundationModelId(modelId: string): string {
  return modelId.replace(/^(global|us|eu|apac)\./, "");
}

const TOKEN_COUNT_FALLBACKS: Record<string, string> = {
  "anthropic.claude-sonnet-5": "anthropic.claude-sonnet-4-6",
};

function toTokenCountModelId(modelId: string): string {
  const foundationId = toFoundationModelId(modelId);
  return TOKEN_COUNT_FALLBACKS[foundationId] ?? foundationId;
}

/**
 * Default implementation of the BedrockClient interface that provides AI text generation
 * capabilities using AWS Bedrock Runtime service.
 *
 * This client supports:
 * - Rate limiting for both requests and tokens
 * - Prompt caching for supported models
 * - Response transformation
 * - Token usage tracking
 *
 * @example
 * ```typescript
 * const client = new DefaultBedrockClient(
 *   "anthropic.claude-3-sonnet-20240229-v1:0",
 *   1000, // maxTokens
 *   10,   // requestRate per minute
 *   1000, // tokenRate per minute
 * );
 *
 * const response = await client.generate({
 *   prompt: "Tell me a joke",
 *   context: "You are a helpful assistant"
 * });
 * ```
 */
export class DefaultBedrockClient implements BedrockClient {
  /** The AWS Bedrock Runtime client instance */
  private readonly client: BedrockRuntimeClient;

  /** Rate limiter for controlling request frequency */
  private readonly requestRateLimiter: RateLimiter;

  /** Rate limiter for controlling token consumption rate */
  private readonly tokenRateLimiter: RateLimiter;

  /**
   * Creates a new DefaultBedrockClient instance.
   *
   * @param modelId - The AWS Bedrock model identifier (e.g., "anthropic.claude-3-sonnet-20240229-v1:0")
   * @param maxTokens - Maximum number of tokens to generate in a single request
   * @param requestRate - Maximum number of requests per minute (0 = no limit)
   * @param tokenRate - Maximum number of tokens per minute (0 = no limit)
   */
  public constructor(
    private readonly modelId: string,
    private readonly maxTokens: number,
    requestRate: number,
    tokenRate: number,
  ) {
    this.client = new BedrockRuntimeClient({
      customUserAgent: USER_AGENT,
    });

    let requestRateLimiter = new NoopRateLimiter();
    if (requestRate > 0) {
      requestRateLimiter = new SlidingLogRateLimiter(requestRate);
    }
    this.requestRateLimiter = requestRateLimiter;

    let tokenRateLimiter = new NoopRateLimiter();
    if (tokenRate > 0) {
      tokenRateLimiter = new SlidingLogRateLimiter(tokenRate);
    }
    this.tokenRateLimiter = tokenRateLimiter;
  }

  /**
   * Generates AI text based on the provided prompt.
   *
   * This method handles the complete generation workflow including:
   * - Rate limiting enforcement
   * - Prompt caching when enabled and supported
   * - Response transformation if specified in the prompt
   * - Comprehensive token usage tracking
   *
   * @param prompt - The prompt configuration containing text, context, and optional settings
   * @param cacheEnabled - Whether to enable prompt caching for supported models (default: false)
   * @returns Promise resolving to the generated response with usage statistics
   *
   * @throws {Error} When the response is truncated because the max token limit was reached
   * @throws {Error} When an unexpected stop reason is encountered
   *
   * @example
   * ```typescript
   * // Basic generation
   * const response = await client.generate({
   *   prompt: "Explain quantum computing",
   *   context: "You are a physics professor"
   * });
   *
   * // With caching enabled
   * const response = await client.generate({
   *   prompt: "What is machine learning?",
   *   context: "You are an AI expert"
   * }, true);
   *
   * // With response transformation
   * const response = await client.generate({
   *   prompt: "Say hello",
   *   transform: (text) => text.toUpperCase()
   * });
   * ```
   */
  async generate(
    prompt: Prompt,
    cacheEnabled: boolean = false,
  ): Promise<BedrockClientGenerateResponse> {
    const tokenUsageCounter = new TokenUsageCounter();

    const conversation = [this.buildUserMessage(prompt, cacheEnabled)];

    const estimatedTokens = await this.estimateTokens(
      conversation,
      prompt.sampleOutput,
    );

    tokenUsageCounter.addEstimated(estimatedTokens);

    const command = new ConverseCommand({
      modelId: this.modelId,
      messages: conversation,
      inferenceConfig: { maxTokens: this.maxTokens },
      ...(prompt.outputSchema && {
        outputConfig: {
          textFormat: {
            type: "json_schema",
            structure: {
              jsonSchema: {
                schema: JSON.stringify(
                  z.toJSONSchema(prompt.outputSchema.schema),
                ),
                name: prompt.outputSchema.name,
                description: prompt.outputSchema.description,
              },
            },
          },
        },
      }),
    });

    await Promise.all([
      this.requestRateLimiter.waitAndConsume(1),
      this.tokenRateLimiter.wait(estimatedTokens),
    ]);

    const timestamp = Date.now();

    const responseObject = await this.client.send(command);

    let response =
      responseObject.output?.message?.content?.find(
        (block) => block.text !== undefined,
      )?.text ?? "";

    this.tokenRateLimiter.consume(
      responseObject.usage?.totalTokens || 0,
      timestamp,
    );

    if (responseObject.usage) {
      tokenUsageCounter.addUsage(responseObject.usage);
    }

    if (responseObject.stopReason === "max_tokens") {
      throw new Error(
        "Response was truncated because the maximum token limit was reached. Increase ai.maxTokens and try again.",
      );
    }

    if (responseObject.stopReason !== "end_turn") {
      throw new Error(`Unexpected stop reason: ${responseObject.stopReason}`);
    }

    if (prompt.transform) {
      response = prompt.transform(response);
    }

    return {
      output: response,
      usage: tokenUsageCounter.get(),
    };
  }

  /**
   * Generates AI output by running a multi-turn tool use loop.
   *
   * The provided tools are presented to the model, and any tool calls in the
   * response are validated against the tool's schema and dispatched to its
   * handler. Handler outcomes drive the loop: `result` and `error` outcomes
   * are fed back to the model as tool results and the loop continues, while
   * a `done` outcome terminates the loop. Validation failures are returned
   * to the model as error results so it can correct itself.
   *
   * Rate limits are enforced on every turn. Token usage is accumulated
   * across all turns.
   *
   * @param prompt - The prompt configuration containing text, context, and optional images
   * @param tools - Tools to present to the model
   * @param options - Loop options including forced tool choice and turn limit
   * @returns Promise resolving to the accumulated usage and termination reason
   *
   * @throws {Error} When the turn limit is exhausted before the loop terminates
   * @throws {Error} When the response is truncated because the max token limit was reached
   * @throws {Error} When an unexpected stop reason is encountered
   * @throws {Error} When the model calls a tool that was not provided
   */
  async generateWithTools(
    prompt: Prompt,
    tools: AgentTool[],
    options: GenerateWithToolsOptions = {},
  ): Promise<GenerateWithToolsResponse> {
    const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
    const tokenUsageCounter = new TokenUsageCounter();
    const debug = options.onDebug ?? (() => {});
    const turnTrace: string[] = [];

    const toolConfigTools: Tool[] = tools.map((tool) => ({
      toolSpec: {
        name: tool.name,
        description: tool.description,
        inputSchema: {
          json: z.toJSONSchema(tool.inputSchema) as unknown as DocumentType,
        },
      },
    }));

    const conversation: Message[] = [
      this.buildUserMessage(prompt, options.cacheEnabled ?? false),
    ];

    for (let turn = 0; turn < maxTurns; turn++) {
      let toolChoice: ToolChoice = options.requireTool
        ? { any: {} }
        : { auto: {} };
      if (turn === 0 && options.forceTool) {
        toolChoice = { tool: { name: options.forceTool } };
      }

      const command = new ConverseCommand({
        modelId: this.modelId,
        messages: [...conversation],
        inferenceConfig: { maxTokens: this.maxTokens },
        toolConfig: {
          tools: toolConfigTools,
          toolChoice,
        },
      });

      const estimatedTokens = await this.estimateTokens(
        conversation,
        turn === 0 ? prompt.sampleOutput : undefined,
      );

      tokenUsageCounter.addEstimated(estimatedTokens);

      await Promise.all([
        this.requestRateLimiter.waitAndConsume(1),
        this.tokenRateLimiter.wait(estimatedTokens),
      ]);

      const timestamp = Date.now();

      const responseObject = await this.client.send(command);

      this.tokenRateLimiter.consume(
        responseObject.usage?.totalTokens || 0,
        timestamp,
      );

      if (responseObject.usage) {
        tokenUsageCounter.addUsage(responseObject.usage);
      }

      if (responseObject.stopReason === "max_tokens") {
        throw new Error(
          "Response was truncated because the maximum token limit was reached. Increase ai.maxTokens and try again.",
        );
      }

      if (responseObject.stopReason === "end_turn") {
        debug(`Turn ${turn + 1}: model finished with end_turn`);
        return {
          usage: tokenUsageCounter.get(),
          stopReason: "end_turn",
        };
      }

      if (responseObject.stopReason !== "tool_use") {
        throw new Error(`Unexpected stop reason: ${responseObject.stopReason}`);
      }

      const assistantMessage = responseObject.output?.message;

      if (!assistantMessage) {
        throw new Error("Model response did not contain a message");
      }

      conversation.push(assistantMessage);

      const toolUses = (assistantMessage.content ?? [])
        .map((block) => block.toolUse)
        .filter((toolUse) => toolUse !== undefined);

      if (toolUses.length === 0) {
        throw new Error(
          "Model stopped for tool use but no tool use block was found",
        );
      }

      const toolResults: ToolResultBlock[] = [];
      let done = false;

      for (const toolUse of toolUses) {
        const outcome = await this.executeTool(tools, toolUse);

        const outcomeDetail =
          outcome.kind === "error" ? `error: ${outcome.message}` : outcome.kind;
        turnTrace.push(`turn ${turn + 1}: ${toolUse.name} -> ${outcomeDetail}`);
        debug(
          `Turn ${turn + 1}/${maxTurns}: ${toolUse.name} -> ${outcomeDetail}`,
        );

        if (outcome.kind === "done") {
          done = true;
          break;
        }

        toolResults.push({
          toolUseId: toolUse.toolUseId,
          content: [
            {
              text:
                outcome.kind === "result" ? outcome.content : outcome.message,
            },
          ],
          status: outcome.kind === "error" ? "error" : "success",
        });
      }

      if (done) {
        return {
          usage: tokenUsageCounter.get(),
          stopReason: "tool",
        };
      }

      conversation.push({
        role: "user",
        content: toolResults.map((toolResult) => ({ toolResult })),
      });
    }

    const recentTrace = turnTrace.slice(-6).join("\n  ");

    throw new Error(
      `Tool use loop did not complete within ${maxTurns} turns. The model may be stuck retrying failed tool calls. Recent activity:\n  ${recentTrace}`,
    );
  }

  private async executeTool(
    tools: AgentTool[],
    toolUse: { name?: string; input?: unknown },
  ): Promise<ToolOutcome> {
    const tool = tools.find((t) => t.name === toolUse.name);

    if (!tool) {
      throw new Error(`Model called unknown tool: ${toolUse.name}`);
    }

    const parsed = tool.inputSchema.safeParse(toolUse.input);

    if (!parsed.success) {
      return {
        kind: "error",
        message: `Invalid input for tool ${tool.name}: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(", ")}`,
      };
    }

    return await tool.handler(parsed.data);
  }

  private buildUserMessage(prompt: Prompt, cacheEnabled: boolean): Message {
    return {
      role: "user" as ConversationRole,
      content: [
        ...(prompt.context ? [{ text: prompt.context }] : []),

        ...(cacheEnabled
          ? [
              {
                cachePoint: {
                  type: "default" as CachePointType,
                },
              },
            ]
          : []),
        {
          text: prompt.prompt,
        },
        ...(prompt.images || []).map((img) => ({
          image: {
            format: img.format as ImageFormat,
            source: { bytes: img.bytes },
          },
        })),
      ],
    };
  }

  private async estimateTokens(
    messages: Message[],
    sampleOutput: string | undefined,
  ) {
    const finalMessages = [...messages];

    if (sampleOutput) {
      finalMessages.push({
        role: "user",
        content: [{ text: sampleOutput.trim() }],
      });
    }

    const command = new CountTokensCommand({
      modelId: toTokenCountModelId(this.modelId),
      input: {
        converse: { messages: finalMessages },
      },
    });

    const responseObject = await this.client.send(command);

    return responseObject.inputTokens ?? 0;
  }
}
