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
 * Rate limiting module for controlling the rate of operations.
 *
 * This module provides interfaces and implementations for rate limiting functionality,
 * which can be used to control the rate of API calls, requests, or any other operations
 * that need to be limited over time.
 *
 * @module rateLimiting
 */

export * from "./noopRateLimiter.js";
export * from "./rateLimiter.js";
export * from "./slidingLogRateLimiter.js";
