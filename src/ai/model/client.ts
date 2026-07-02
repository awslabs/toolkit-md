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
} from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import type { Prompt } from "../prompts/index.js";
import {
  NoopRateLimiter,
  type RateLimiter,
  SlidingLogRateLimiter,
} from "./rateLimiting/index.js";
import type { BedrockClient, BedrockClientGenerateResponse } from "./types.js";
import { TokenUsageCounter } from "./utils.js";

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

    const promptText = prompt.prompt;
    const promptContext = prompt.context;

    const conversation = [
      {
        role: "user" as ConversationRole,
        content: [
          ...(promptContext ? [{ text: promptContext }] : []),

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
            text: promptText,
          },
          ...(prompt.images || []).map((img) => ({
            image: {
              format: img.format as ImageFormat,
              source: { bytes: img.bytes },
            },
          })),
        ],
      },
    ];

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

    // biome-ignore lint/style/noNonNullAssertion: Need to see if this needs better checks
    let response = responseObject.output!.message!.content![0].text ?? "";

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
      modelId: toFoundationModelId(this.modelId),
      input: {
        converse: { messages: finalMessages },
      },
    });

    const responseObject = await this.client.send(command);

    return responseObject.inputTokens ?? 0;
  }
}
