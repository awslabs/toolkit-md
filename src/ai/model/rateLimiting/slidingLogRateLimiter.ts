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

import { setTimeout } from "node:timers/promises";
import type { RateLimiter } from "./rateLimiter.js";

/**
 * Implementation of RateLimiter using a sliding log algorithm.
 * Tracks token consumption over time and enforces rate limits based on a specified time window.
 */
export class SlidingLogRateLimiter implements RateLimiter {
  /**
   * Log of requests with their timestamps and token counts.
   * Each entry is an array where the first element is the timestamp and the second is the token count.
   */
  private readonly requestLog: number[][] = [];

  /**
   * Maximum number of tokens that can be consumed within the time window.
   */
  private readonly limit: number;

  /**
   * Time window in milliseconds for rate limiting.
   */
  private readonly timeWindow: number;

  /**
   * Creates a new instance of SlidingLogRateLimiter.
   *
   * @param limit - Maximum number of tokens that can be consumed within the time window (default: 5)
   * @param timeWindowInSeconds - Time window in seconds for rate limiting (default: 60)
   */
  constructor(limit: number = 5, timeWindowInSeconds: number = 60) {
    this.limit = limit;
    this.timeWindow = timeWindowInSeconds * 1000;
  }

  /**
   * Waits until the specified number of tokens can be consumed based on the rate limit,
   * then consumes them.
   *
   * @param tokens - The number of tokens to wait for and consume
   * @returns A promise that resolves when the tokens have been consumed
   */
  public async waitAndConsume(tokens: number): Promise<void> {
    await this.wait(tokens);

    await this.consume(tokens);
  }

  /**
   * Waits until the specified number of tokens can be consumed based on the rate limit.
   * Does not actually consume the tokens.
   *
   * @param tokens - The number of tokens to wait for (default: 1)
   * @returns A promise that resolves when it's safe to consume the tokens
   */
  public async wait(tokens: number = 1): Promise<void> {
    this.cleanupOutdatedRequests();

    const currentTokens = this.getCurrentTokenCount();

    if (currentTokens + tokens <= this.limit) {
      return;
    }

    const timeToWait = this.calculateWaitTime(tokens);
    await setTimeout(timeToWait);
  }

  /**
   * Consumes the specified number of tokens at the given time.
   *
   * @param tokens - The number of tokens to consume (default: 1)
   * @param at - Optional timestamp when the tokens were consumed (defaults to current time)
   * @returns A promise that resolves when the tokens have been consumed
   */
  public async consume(tokens: number = 1, at?: number): Promise<void> {
    const timestamp = at || Date.now();

    this.requestLog.push([timestamp, tokens]);
  }

  /**
   * Removes requests from the log that are outside the current time window.
   */
  private cleanupOutdatedRequests(): void {
    const now = Date.now();

    while (
      this.requestLog.length > 0 &&
      now - this.requestLog[0][0] >= this.timeWindow
    ) {
      this.requestLog.shift();
    }
  }

  /**
   * Calculates the total number of tokens consumed within the current time window.
   *
   * @returns The total token count
   */
  private getCurrentTokenCount(): number {
    return this.requestLog.reduce((sum, [_, tokens]) => sum + tokens, 0);
  }

  /**
   * Calculates how long to wait before the specified number of tokens can be consumed.
   *
   * @param tokensNeeded - The number of tokens that need to be consumed
   * @returns The time to wait in milliseconds
   * @throws Error if the required tokens exceed the limit
   */
  private calculateWaitTime(tokensNeeded: number): number {
    let accumulatedTokens = 0;
    let oldestValidIndex = -1;

    for (let i = 0; i < this.requestLog.length; i++) {
      accumulatedTokens += this.requestLog[i][1];
      if (
        this.getCurrentTokenCount() - accumulatedTokens + tokensNeeded <=
        this.limit
      ) {
        oldestValidIndex = i;
        break;
      }
    }

    if (oldestValidIndex === -1) {
      throw new Error(
        "Cannot calculate wait time: required tokens exceed limit",
      );
    }

    const oldestRequestTime = this.requestLog[oldestValidIndex][0];
    const now = Date.now();
    return Math.max(0, oldestRequestTime + this.timeWindow - now);
  }
}
