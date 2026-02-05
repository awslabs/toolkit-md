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
} from "@aws-sdk/client-bedrock-runtime";
import type { Prompt } from "../prompts/index.js";
import {
  NoopRateLimiter,
  type RateLimiter,
  SlidingLogRateLimiter,
} from "./rateLimiting/index.js";
import type { BedrockClient, BedrockClientGenerateResponse } from "./types.js";
import { estimateTokens, TokenUsageCounter } from "./utils.js";

/**
 * Default implementation of the BedrockClient interface that provides AI text generation
 * capabilities using AWS Bedrock Runtime service.
 *
 * This client supports:
 * - Rate limiting for both requests and tokens
 * - Multi-iteration generation for handling max token limits
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
 *   3     // maxIterations
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
   * @param maxIterations - Maximum number of iterations for handling max token responses
   */
  public constructor(
    private readonly modelId: string,
    private readonly maxTokens: number,
    requestRate: number,
    tokenRate: number,
    private readonly maxIterations: number,
  ) {
    this.client = new BedrockRuntimeClient();

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
   * - Multi-iteration generation for responses that exceed max tokens
   * - Prompt caching when enabled and supported
   * - Response transformation if specified in the prompt
   * - Comprehensive token usage tracking
   *
   * @param prompt - The prompt configuration containing text, context, and optional settings
   * @param cacheEnabled - Whether to enable prompt caching for supported models (default: false)
   * @returns Promise resolving to the generated response with usage statistics
   *
   * @throws {Error} When maximum iterations are exceeded
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
    let prefill = prompt.prefill ?? "";

    let iterations = 0;

    while (true) {
      // TODO: Emit event about iteration counter

      if (iterations > this.maxIterations) {
        throw new Error("Maximum iterations breached");
      }

      const conversation = [
        {
          role: "user" as ConversationRole,
          content: [
            ...(promptContext ? [{ text: promptContext }] : []),

            ...(cacheEnabled && this.isCachingSupported(this.modelId)
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
          ],
        },
        ...(prefill
          ? [
              {
                role: "assistant" as ConversationRole,
                content: [{ text: prefill }],
              },
            ]
          : []),
      ];

      const estimatedTokens = estimateTokens(
        promptContext ?? "",
        promptText,
        prefill,
        prompt.sampleOutput ?? "",
      );

      tokenUsageCounter.addEstimated(estimatedTokens);

      const command = new ConverseCommand({
        modelId: this.modelId,
        messages: conversation,
        inferenceConfig: { maxTokens: this.maxTokens },
      });

      await Promise.all([
        this.requestRateLimiter.waitAndConsume(1),
        this.tokenRateLimiter.wait(estimatedTokens),
      ]);

      const timestamp = Date.now();

      const responseObject = await this.client.send(command);

      // biome-ignore lint/style/noNonNullAssertion: Need to see if this needs better checks
      let response = prefill + responseObject.output!.message!.content![0].text;

      this.tokenRateLimiter.consume(
        responseObject.usage?.totalTokens || 0,
        timestamp,
      );

      if (responseObject.usage) {
        tokenUsageCounter.addUsage(responseObject.usage);
      }

      if (responseObject.stopReason === "max_tokens") {
        prefill = response.trimEnd();
        iterations++;

        continue;
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
  }

  /**
   * Determines whether prompt caching is supported for the given model ID.
   *
   * Caching can improve performance and reduce costs by reusing previously
   * processed context across multiple requests. This feature is only available
   * for specific model versions.
   *
   * @param modelId - The AWS Bedrock model identifier to check
   * @returns True if the model supports prompt caching, false otherwise
   *
   * @private
   */
  private isCachingSupported(modelId: string) {
    const validModels = [
      "anthropic.claude-opus-4-6",
      "anthropic.claude-opus-4-5",
      "anthropic.claude-opus-4-1",
      "anthropic.claude-opus-4",
      "anthropic.claude-sonnet-4-5",
      "anthropic.claude-haiku-4-5",
      "anthropic.claude-opus-4",
      "anthropic.claude-sonnet-4",
      "anthropic.claude-3-7-sonnet",
      "anthropic.claude-3-5-haiku",
      "amazon.nova-micro-v1:0",
      "amazon.nova-lite-v1:0",
      "amazon.nova-pro-v1:0",
    ];

    for (const validModel of validModels) {
      if (modelId.includes(validModel)) {
        return true;
      }
    }

    return false;
  }
}
