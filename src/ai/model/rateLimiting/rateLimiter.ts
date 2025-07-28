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

/**
 * Interface for rate limiting functionality.
 * Provides methods to control the rate of operations based on token consumption.
 */
export interface RateLimiter {
  /**
   * Waits until the specified number of tokens can be consumed based on the rate limit.
   * Does not actually consume the tokens.
   *
   * @param tokens - The number of tokens to wait for
   * @returns A promise that resolves when it's safe to consume the tokens
   */
  wait(tokens: number): Promise<void>;

  /**
   * Consumes the specified number of tokens at the given time.
   *
   * @param tokens - The number of tokens to consume
   * @param at - Optional timestamp when the tokens were consumed (defaults to current time)
   * @returns A promise that resolves when the tokens have been consumed
   */
  consume(tokens: number, at?: number): Promise<void>;

  /**
   * Combines wait and consume operations - waits until tokens can be consumed,
   * then consumes them.
   *
   * @param tokens - The number of tokens to wait for and consume
   * @returns A promise that resolves when the tokens have been consumed
   */
  waitAndConsume(tokens: number): Promise<void>;
}
