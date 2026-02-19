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
 * @fileoverview Markdown linting checker using markdownlint.
 *
 * Validates markdown content against markdownlint rules, with support
 * for ignoring specific rules by name or alias.
 */

import { lint } from "markdownlint/promise";
import type { CheckIssue } from "./types.js";

/**
 * Runs markdownlint on the given content and returns any issues found.
 *
 * @param filePath - Path to the file being checked (used for reporting)
 * @param content - Raw markdown content to lint
 * @param ignoreRules - Rule names or aliases to disable
 * @returns Array of check issues found by markdownlint
 */
export async function checkLint(
  filePath: string,
  content: string,
  ignoreRules: string[],
): Promise<CheckIssue[]> {
  const config: Record<string, boolean> = {
    default: true,
    MD033: false,
    MD013: false,
  };
  for (const rule of ignoreRules) {
    config[rule] = false;
  }

  const results = await lint({
    strings: { [filePath]: content },
    config,
  });

  const fileResults = results[filePath];
  if (!fileResults) {
    return [];
  }

  return fileResults.map((result) => ({
    file: filePath,
    line: result.lineNumber,
    column: 1,
    severity: "warning" as const,
    category: "lint" as const,
    rule: result.ruleNames.join("/"),
    message: result.ruleDescription,
  }));
}
