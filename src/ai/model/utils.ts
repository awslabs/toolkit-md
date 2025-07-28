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

import { get_encoding } from "tiktoken";
import type { TokenUsage } from "./types.js";

export class TokenUsageCounter {
  private sumInputTokens = 0;
  private sumOutputTokens = 0;
  private sumTotalTokens = 0;
  private sumEstimatedTokens = 0;
  private sumCacheReadInputTokens = 0;
  private sumCacheWriteInputTokens = 0;

  public addEstimated(estimatedTokens: number) {
    this.sumEstimatedTokens += estimatedTokens;
  }

  public addUsage(usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cacheReadInputTokens?: number;
    cacheWriteInputTokens?: number;
  }) {
    if (!usage) {
      return;
    }

    const {
      inputTokens,
      outputTokens,
      totalTokens,
      cacheReadInputTokens,
      cacheWriteInputTokens,
    } = usage;

    this.sumInputTokens += inputTokens || 0;
    this.sumOutputTokens += outputTokens || 0;
    this.sumTotalTokens += totalTokens || 0;
    this.sumCacheReadInputTokens += cacheReadInputTokens || 0;
    this.sumCacheWriteInputTokens += cacheWriteInputTokens || 0;
  }

  public get(): TokenUsage {
    return {
      inputTokens: this.sumInputTokens,
      outputTokens: this.sumOutputTokens,
      totalTokens: this.sumTotalTokens,
      cacheReadInputTokens: this.sumCacheReadInputTokens,
      cacheWriteInputTokens: this.sumCacheWriteInputTokens,
      estimatedTokens: this.sumEstimatedTokens,
    };
  }
}

export function estimateTokens(...chunks: string[]) {
  const enc = get_encoding("gpt2");

  let total = 0;

  for (const chunk of chunks) {
    total += enc.encode(chunk).length;
  }

  return total;
}
