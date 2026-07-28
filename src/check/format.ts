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
 * @fileoverview Shared formatting for check results.
 *
 * Renders aggregated check results as text for both the CLI command
 * (with terminal colors) and the MCP tool (plain text).
 */

import chalk from "chalk";
import type { CheckResult } from "./types.js";

export interface FormatCheckResultsOptions {
  /** Base directory to strip from file paths for display */
  baseDir?: string;

  /** Whether to apply terminal colors */
  colors?: boolean;
}

/**
 * Formats aggregated check results as a multi-line report.
 *
 * Files without issues are omitted. The report ends with a summary line
 * of total errors and warnings, or a success message when clean.
 *
 * @param result - Aggregated check results
 * @param options - Display options
 * @returns The formatted report
 */
export function formatCheckResults(
  result: CheckResult,
  options: FormatCheckResultsOptions = {},
): string {
  const { baseDir, colors = false } = options;

  const style = {
    underline: colors ? chalk.underline : (s: string) => s,
    gray: colors ? chalk.gray : (s: string) => s,
    red: colors ? chalk.red : (s: string) => s,
    yellow: colors ? chalk.yellow : (s: string) => s,
    green: colors ? chalk.green : (s: string) => s,
  };

  const lines: string[] = [];

  for (const file of result.files) {
    if (file.issues.length === 0) {
      continue;
    }

    const relativePath =
      baseDir && file.filePath.startsWith(baseDir)
        ? file.filePath.substring(baseDir.length + 1)
        : file.filePath;

    lines.push(style.underline(relativePath));

    for (const issue of file.issues) {
      const location = style.gray(`  ${issue.line}:${issue.column}`);
      const severity =
        issue.severity === "error"
          ? style.red(issue.severity)
          : style.yellow(issue.severity);
      const rule = style.gray(issue.rule);
      const category = style.gray(`(${issue.category})`);
      lines.push(
        `${location}  ${severity}  ${rule}  ${issue.message}  ${category}`,
      );
    }

    lines.push("");
  }

  const summary = [];
  if (result.totalErrors > 0) {
    summary.push(
      style.red(
        `${result.totalErrors} error${result.totalErrors !== 1 ? "s" : ""}`,
      ),
    );
  }
  if (result.totalWarnings > 0) {
    summary.push(
      style.yellow(
        `${result.totalWarnings} warning${result.totalWarnings !== 1 ? "s" : ""}`,
      ),
    );
  }

  const fileCount = result.files.length;
  if (summary.length > 0) {
    lines.push(
      `\nResults: ${summary.join(", ")} in ${fileCount} file${fileCount !== 1 ? "s" : ""}`,
    );
  } else {
    lines.push(
      style.green(
        `\nAll ${fileCount} file${fileCount !== 1 ? "s" : ""} passed`,
      ),
    );
  }

  return lines.join("\n");
}
