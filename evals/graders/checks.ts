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
 * @fileoverview Checks-regression grader.
 *
 * Uses the existing check module as a deterministic quality gate: the
 * issue count on each output must not exceed the issue count on the
 * corresponding input. A review must never make lint or spelling worse.
 * Link and image checks are excluded because corpus fixtures resolve
 * against in-memory trees, not the filesystem.
 */

import { checkNode } from "../../src/check/index.js";
import type { CheckOptions } from "../../src/check/types.js";
import { ContentTree, MockProvider } from "../../src/content/index.js";
import type { FileOutcome, MetricSet } from "../types.js";

function buildCheckOptions(locale: string): CheckOptions {
  return {
    contentDir: "/",
    links: { timeout: 1000, skipExternal: true, ignorePatterns: [] },
    lint: { ignoreRules: [] },
    spell: { ignoreWords: [], skipDirectives: [], locale },
    categories: ["lint", "spell"],
  };
}

async function countIssues(
  filePath: string,
  content: string,
  locale: string,
): Promise<number> {
  const tree = new ContentTree(new MockProvider(), {
    defaultLanguage: locale,
    language: locale,
  });
  const node = tree.forceAdd(filePath, content);
  const result = await checkNode(node, buildCheckOptions(locale));
  return result?.issues.length ?? 0;
}

/**
 * Grades whether outputs regressed under the deterministic checkers
 * relative to their inputs.
 *
 * @param files - Per-file outcomes from the execution
 * @param locale - Locale for the spell checker (output language)
 * @returns Check regression metrics
 */
export async function gradeCheckRegression(
  files: FileOutcome[],
  locale: string,
): Promise<MetricSet> {
  const metrics: MetricSet = { scores: {}, counts: {}, notes: [] };

  const changed = files.filter(
    (f) => f.changed && f.input !== null && f.output !== null,
  );

  let passed = 0;
  let inputIssues = 0;
  let outputIssues = 0;

  for (const file of changed) {
    const before = await countIssues(file.path, file.input as string, locale);
    const after = await countIssues(file.path, file.output as string, locale);

    inputIssues += before;
    outputIssues += after;

    if (after <= before) {
      passed++;
    } else {
      metrics.notes.push(
        `${file.path}: check issues increased from ${before} to ${after}`,
      );
    }
  }

  metrics.scores.checkRegression =
    changed.length === 0 ? 1 : passed / changed.length;
  metrics.counts.checkIssuesBefore = inputIssues;
  metrics.counts.checkIssuesAfter = outputIssues;

  return metrics;
}
