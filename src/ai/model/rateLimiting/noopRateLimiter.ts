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

import type { RateLimiter } from "./rateLimiter.js";

/**
 * A no-operation implementation of the RateLimiter interface.
 * This implementation does not perform any actual rate limiting and immediately resolves all operations.
 * Useful for scenarios where rate limiting needs to be disabled or for testing purposes.
 */
export class NoopRateLimiter implements RateLimiter {
  /**
   * No-operation implementation of wait method.
   * Immediately resolves without waiting.
   *
   * @param tokens - The number of tokens (ignored in this implementation)
   * @returns A promise that resolves immediately
   */
  async wait(_: number): Promise<void> {
    return;
  }

  /**
   * No-operation implementation of consume method.
   * Immediately resolves without consuming any tokens.
   *
   * @param tokens - The number of tokens (ignored in this implementation)
   * @param at - Optional timestamp (ignored in this implementation)
   * @returns A promise that resolves immediately
   */
  async consume(_: number, __?: number): Promise<void> {
    return;
  }

  /**
   * No-operation implementation of waitAndConsume method.
   * Immediately resolves without waiting or consuming any tokens.
   *
   * @param tokens - The number of tokens (ignored in this implementation)
   * @returns A promise that resolves immediately
   */
  async waitAndConsume(_: number): Promise<void> {
    return;
  }
}
