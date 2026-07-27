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
 * @fileoverview Tier 1 structural graders (deterministic, free).
 *
 * Runs on every case: output integrity, whitespace discipline, translation
 * hash correctness, and seeded expectations from the case manifest. All
 * metrics are 0-1 scores backed by raw counts.
 */

import * as matter from "gray-matter";
import {
  LEGACY_TRANSLATION_SRC_HASH_KEY,
  TRANSLATION_SRC_HASH_KEY,
} from "../../src/content/index.js";
import { generateHash } from "../../src/content/utils/markdownUtils.js";
import type {
  CaseExecution,
  CaseManifest,
  FileOutcome,
  MetricSet,
} from "../types.js";

const TRAILING_TAG = /<\/(content|document|file|output)>\s*$/;

function emptyMetrics(): MetricSet {
  return { scores: {}, counts: {}, notes: [] };
}

function ratio(passed: number, total: number): number {
  return total === 0 ? 1 : passed / total;
}

function frontmatterParses(content: string): boolean {
  try {
    matter.default(content);
    return true;
  } catch {
    return false;
  }
}

/**
 * Grades output integrity: no leaked trailing argument tags, parseable
 * frontmatter, and non-empty output for every produced file.
 *
 * @param files - Per-file outcomes from the execution
 * @returns Integrity metrics
 */
export function gradeIntegrity(files: FileOutcome[]): MetricSet {
  const metrics = emptyMetrics();
  const produced = files.filter((f) => f.output !== null);

  let passed = 0;

  for (const file of produced) {
    const output = file.output as string;
    const problems: string[] = [];

    if (output.trim().length === 0) {
      problems.push("output is empty");
    }

    if (
      TRAILING_TAG.test(output) &&
      !(file.input !== null && TRAILING_TAG.test(file.input))
    ) {
      problems.push("trailing argument tag leaked into output");
    }

    if (!frontmatterParses(output)) {
      problems.push("frontmatter does not parse");
    }

    if (problems.length === 0) {
      passed++;
    } else {
      metrics.notes.push(`${file.path}: ${problems.join("; ")}`);
    }
  }

  metrics.scores.integrity = ratio(passed, produced.length);
  metrics.counts.integrityFilesChecked = produced.length;
  metrics.counts.integrityFilesPassed = passed;

  return metrics;
}

/**
 * Grades whitespace discipline for review outputs: trailing newline
 * preserved and no whitespace-only line changes.
 *
 * @param files - Per-file outcomes from the execution
 * @returns Whitespace discipline metrics
 */
export function gradeWhitespace(files: FileOutcome[]): MetricSet {
  const metrics = emptyMetrics();
  const changed = files.filter(
    (f) => f.changed && f.input !== null && f.output !== null,
  );

  let passed = 0;

  for (const file of changed) {
    const input = file.input as string;
    const output = file.output as string;
    const problems: string[] = [];

    const inputEndsWithNewline = input.endsWith("\n");
    const outputEndsWithNewline = output.endsWith("\n");

    if (inputEndsWithNewline !== outputEndsWithNewline) {
      problems.push("trailing newline not preserved");
    }

    const inputLines = input.split("\n");
    const outputLines = output.split("\n");
    const inputTrimmed = inputLines.map((l) => l.trimEnd()).join("\n");
    const outputTrimmed = outputLines.map((l) => l.trimEnd()).join("\n");

    if (inputTrimmed === outputTrimmed && input !== output) {
      problems.push("change is whitespace-only");
    }

    if (problems.length === 0) {
      passed++;
    } else {
      metrics.notes.push(`${file.path}: ${problems.join("; ")}`);
    }
  }

  metrics.scores.whitespace = ratio(passed, changed.length);
  metrics.counts.whitespaceFilesChecked = changed.length;
  metrics.counts.whitespaceFilesPassed = passed;

  return metrics;
}

/**
 * Grades translation hash correctness: output carries the current hash key
 * matching the source hash, and the legacy key is absent.
 *
 * @param files - Per-file outcomes from the execution
 * @param sourceContentByPath - Source content keyed by output path
 * @returns Hash correctness metrics
 */
export function gradeTranslationHash(
  files: FileOutcome[],
  sourceContentByPath: Map<string, string>,
): MetricSet {
  const metrics = emptyMetrics();
  const produced = files.filter(
    (f) => f.output !== null && f.kind === "translated",
  );

  let passed = 0;

  for (const file of produced) {
    const output = file.output as string;
    const problems: string[] = [];

    let frontmatter: Record<string, unknown> = {};
    try {
      frontmatter = matter.default(output).data;
    } catch {
      problems.push("frontmatter does not parse");
    }

    const source = sourceContentByPath.get(file.path);
    const expectedHash = source !== undefined ? generateHash(source) : null;
    const actualHash = frontmatter[TRANSLATION_SRC_HASH_KEY];

    if (actualHash === undefined) {
      problems.push(`missing ${TRANSLATION_SRC_HASH_KEY}`);
    } else if (expectedHash !== null && actualHash !== expectedHash) {
      problems.push(`${TRANSLATION_SRC_HASH_KEY} does not match source hash`);
    }

    if (LEGACY_TRANSLATION_SRC_HASH_KEY in frontmatter) {
      problems.push(`legacy key ${LEGACY_TRANSLATION_SRC_HASH_KEY} present`);
    }

    if (problems.length === 0) {
      passed++;
    } else {
      metrics.notes.push(`${file.path}: ${problems.join("; ")}`);
    }
  }

  metrics.scores.translationHash = ratio(passed, produced.length);
  metrics.counts.hashFilesChecked = produced.length;
  metrics.counts.hashFilesPassed = passed;

  return metrics;
}

/**
 * Grades the seeded expectations from the case manifest: mustFix recall,
 * mustPreserve, shouldChange, and shouldNotChange.
 *
 * @param manifest - Case manifest declaring the expectations
 * @param files - Per-file outcomes from the execution
 * @returns Expectation metrics including seeded-error recall
 */
export function gradeExpectations(
  manifest: CaseManifest,
  files: FileOutcome[],
): MetricSet {
  const metrics = emptyMetrics();
  const { expectations } = manifest;
  const byPath = new Map(files.map((f) => [f.path, f]));

  let fixed = 0;

  for (const fix of expectations.mustFix) {
    const file = byPath.get(fix.file);
    const output = file?.output ?? file?.input;

    if (!output) {
      metrics.notes.push(`mustFix ${fix.file}: no output produced`);
      continue;
    }

    const pattern = new RegExp(fix.pattern);
    const stillPresent = pattern.test(output);
    const replacementPresent = fix.replacedBy
      ? output.includes(fix.replacedBy)
      : true;

    if (!stillPresent && replacementPresent) {
      fixed++;
    } else {
      metrics.notes.push(
        `mustFix ${fix.file}: pattern ${fix.pattern} ${
          stillPresent ? "still present" : "fixed but replacement missing"
        }`,
      );
    }
  }

  metrics.scores.seededRecall = ratio(fixed, expectations.mustFix.length);
  metrics.counts.seededErrors = expectations.mustFix.length;
  metrics.counts.seededErrorsFixed = fixed;

  let preserved = 0;

  for (const keep of expectations.mustPreserve) {
    const file = byPath.get(keep.file);

    if (!file || file.input === null) {
      metrics.notes.push(`mustPreserve ${keep.file}: file not found`);
      continue;
    }

    const output = file.output ?? file.input;
    const pattern = new RegExp(keep.pattern, "g");
    const inputMatches = file.input.match(pattern) ?? [];
    const allPreserved = inputMatches.every((m) => output.includes(m));

    if (allPreserved) {
      preserved++;
    } else {
      metrics.notes.push(
        `mustPreserve ${keep.file}: pattern ${keep.pattern} not preserved`,
      );
    }
  }

  metrics.scores.preservation = ratio(
    preserved,
    expectations.mustPreserve.length,
  );
  metrics.counts.preservePatterns = expectations.mustPreserve.length;
  metrics.counts.preservePatternsKept = preserved;

  let changedAsExpected = 0;

  for (const path of expectations.shouldChange) {
    const file = byPath.get(path);

    if (file?.changed) {
      changedAsExpected++;
    } else {
      metrics.notes.push(`shouldChange ${path}: file was not changed`);
    }
  }

  metrics.scores.shouldChange = ratio(
    changedAsExpected,
    expectations.shouldChange.length,
  );

  let unchangedAsExpected = 0;

  for (const path of expectations.shouldNotChange) {
    const file = byPath.get(path);

    if (!file || !file.changed) {
      unchangedAsExpected++;
    } else {
      metrics.notes.push(`shouldNotChange ${path}: file was changed`);
    }
  }

  metrics.scores.shouldNotChange = ratio(
    unchangedAsExpected,
    expectations.shouldNotChange.length,
  );
  metrics.counts.falsePositiveEdits =
    expectations.shouldNotChange.length - unchangedAsExpected;

  return metrics;
}

/**
 * Runs all structural graders applicable to an execution and merges their
 * metrics.
 *
 * @param manifest - Case manifest
 * @param execution - Observed execution
 * @param sourceContentByPath - Source content for translate hash checks
 * @returns Merged structural metrics
 */
export function gradeStructural(
  manifest: CaseManifest,
  execution: CaseExecution,
  sourceContentByPath: Map<string, string>,
): MetricSet {
  const parts: MetricSet[] = [
    gradeIntegrity(execution.files),
    gradeExpectations(manifest, execution.files),
  ];

  if (manifest.operation === "review") {
    parts.push(gradeWhitespace(execution.files));
  }

  if (manifest.operation === "translate") {
    parts.push(gradeTranslationHash(execution.files, sourceContentByPath));
  }

  return mergeMetrics(parts);
}

/**
 * Merges multiple metric sets into one, unioning scores, counts, and notes.
 *
 * @param parts - Metric sets to merge
 * @returns The merged metric set
 */
export function mergeMetrics(parts: MetricSet[]): MetricSet {
  const merged = emptyMetrics();

  for (const part of parts) {
    Object.assign(merged.scores, part.scores);
    Object.assign(merged.counts, part.counts);
    merged.notes.push(...part.notes);
  }

  return merged;
}
