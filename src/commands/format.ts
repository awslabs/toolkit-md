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
 * @fileoverview Terminal output formatting for CLI commands.
 */

import chalk from "chalk";
import { diffWordsWithSpace } from "diff";
import type { TokenUsage } from "../ai/index.js";

/**
 * Renders a colored word-level diff of two content versions to stderr.
 *
 * @param originalContent - The original content
 * @param updatedContent - The updated content
 */
export function displayDiff(originalContent: string, updatedContent: string) {
  const diff = diffWordsWithSpace(originalContent, updatedContent);

  diff.forEach((part) => {
    let text = part.value;
    const whitespace = text.trim().length === 0;

    if (part.added) {
      text = whitespace ? chalk.green.bgGreen(text) : chalk.green(text);
    } else if (part.removed) {
      text = whitespace
        ? chalk.red.bgRed(text)
        : chalk.red(chalk.strikethrough(text));
    }
    process.stderr.write(text);
  });
}

/**
 * Formats token usage as a single summary line.
 *
 * @param usage - Token usage to format
 * @returns The formatted usage line
 */
export function printTokenUsage(usage: TokenUsage) {
  let cacheUsage = "";

  if (usage.cacheReadInputTokens) {
    cacheUsage += ` Cache Read ${usage.cacheReadInputTokens}`;
  }

  if (usage.cacheWriteInputTokens) {
    cacheUsage += ` Cache Write ${usage.cacheWriteInputTokens}`;
  }

  if (cacheUsage) {
    cacheUsage = ` (${cacheUsage.trim()})`;
  }

  return `Usage: Input ${usage.inputTokens}${cacheUsage} | Output ${usage.outputTokens} | Total ${usage.totalTokens} | Estimated ${usage.estimatedTokens}`;
}
