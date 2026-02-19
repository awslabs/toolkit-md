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
 * @fileoverview Utilities for resolving paths that use a static prefix.
 *
 * Provides functions to detect whether a given path matches a configured
 * static prefix and to resolve the full filesystem path against the
 * static directory.
 */

import { join } from "node:path";

/**
 * Resolves a static-prefixed path to its full filesystem path.
 *
 * Returns `null` if the path does not match the static prefix or if
 * the static prefix/directory are not configured.
 *
 * @param path - The URL or file path to resolve
 * @param staticPrefix - The prefix that identifies static paths
 * @param staticDir - The directory to resolve static paths against
 * @returns The resolved filesystem path, or `null` if not a static path
 */
export function resolveStaticPath(
  path: string,
  staticPrefix?: string,
  staticDir?: string,
): string | null {
  if (!staticPrefix || !staticDir || !path.startsWith(staticPrefix)) {
    return null;
  }

  const relativePath = path.substring(staticPrefix.length);
  return join(staticDir, relativePath);
}
