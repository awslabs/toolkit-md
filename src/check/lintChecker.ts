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
 * @fileoverview Markdown linting checker using remark-lint.
 *
 * Validates markdown content against remark-lint rules from the
 * recommended and consistent presets, with support for ignoring
 * specific rules by name.
 */

import { remark } from "remark";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkLintCodeBlockStyle from "remark-lint-code-block-style";
import remarkLintHeadingStyle from "remark-lint-heading-style";
import remarkLintNoUndefinedReferences from "remark-lint-no-undefined-references";
import remarkPresetLintConsistent from "remark-preset-lint-consistent";
import remarkPresetLintRecommended from "remark-preset-lint-recommended";
import type { VFile } from "vfile";
import remarkCodeDirective from "../content/utils/remarkCodeDirective.js";
import type { CheckIssue } from "./types.js";

/**
 * Runs remark-lint on the given content and returns any issues found.
 *
 * @param filePath - Path to the file being checked (used for reporting)
 * @param content - Raw markdown content to lint
 * @param ignoreRules - Rule names to suppress (without the `remark-lint-` prefix)
 * @returns Array of check issues found by remark-lint
 */
export async function checkLint(
  filePath: string,
  content: string,
  ignoreRules: string[],
): Promise<CheckIssue[]> {
  const processor = remark()
    .use(remarkFrontmatter)
    .use(remarkDirective)
    .use(remarkCodeDirective)
    .use(remarkPresetLintConsistent)
    .use(remarkPresetLintRecommended)
    .use(remarkLintNoUndefinedReferences, false)
    .use(remarkLintCodeBlockStyle, false)
    .use(remarkLintHeadingStyle, "atx");

  const file: VFile = await processor.process({
    path: filePath,
    value: content,
  });

  const ignoreSet = new Set(
    ignoreRules.map((r) => r.replace(/^remark-lint-/, "")),
  );

  return file.messages
    .filter((msg) => {
      const ruleId = msg.ruleId ?? "";
      return !ignoreSet.has(ruleId);
    })
    .map((msg) => ({
      file: filePath,
      line: msg.line ?? 1,
      column: msg.column ?? 1,
      severity: "warning" as const,
      category: "lint" as const,
      rule: msg.ruleId ?? "unknown",
      message: msg.reason,
    }));
}
