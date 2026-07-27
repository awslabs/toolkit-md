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

import { describe, expect, test } from "vitest";
import {
  aggregate,
  compareRuns,
  detectDrift,
  renderComparisonReport,
  renderRunReport,
} from "../../evals/report.js";
import type { CaseResult, RunArtifact } from "../../evals/types.js";

function result(overrides: Partial<CaseResult>): CaseResult {
  return {
    caseId: "review/typos-basic",
    operation: "review",
    editMode: "write",
    repetition: 0,
    failed: false,
    durationMs: 1000,
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      estimatedTokens: 90,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 0,
    },
    scores: { seededRecall: 1 },
    counts: { outputTokens: 50 },
    notes: [],
    ...overrides,
  };
}

function artifact(results: CaseResult[], modelId = "model-a"): RunArtifact {
  return {
    metadata: {
      timestamp: "2026-07-27T00:00:00.000Z",
      modelId,
      toolkitVersion: "0.3.1",
      promptHashes: { "src/ai/prompts/reviewPrompt.ts": "abc" },
      repetitions: 3,
      rubric: "none",
    },
    results,
  };
}

describe("aggregate", () => {
  test("computes mean and range across repetitions", () => {
    const aggregates = aggregate([
      result({ repetition: 0, scores: { seededRecall: 1 } }),
      result({ repetition: 1, scores: { seededRecall: 0.5 } }),
      result({ repetition: 2, scores: { seededRecall: 0.75 } }),
    ]);

    expect(aggregates.length).toBe(1);
    expect(aggregates[0].scores.seededRecall.mean).toBeCloseTo(0.75);
    expect(aggregates[0].scores.seededRecall.min).toBe(0.5);
    expect(aggregates[0].scores.seededRecall.max).toBe(1);
    expect(aggregates[0].repetitions).toBe(3);
  });

  test("groups by case and edit mode separately", () => {
    const aggregates = aggregate([
      result({ editMode: "write" }),
      result({ editMode: "edits" }),
    ]);

    expect(aggregates.length).toBe(2);
  });

  test("counts failures and collects error classes", () => {
    const aggregates = aggregate([
      result({ repetition: 0 }),
      result({ repetition: 1, failed: true, errorClass: "Error" }),
    ]);

    expect(aggregates[0].failures).toBe(1);
    expect(aggregates[0].errorClasses).toEqual(["Error"]);
  });
});

describe("compareRuns", () => {
  test("flags regression only when ranges do not overlap", () => {
    const baseline = artifact([
      result({ repetition: 0, scores: { seededRecall: 0.9 } }),
      result({ repetition: 1, scores: { seededRecall: 1 } }),
    ]);

    const overlapping = artifact([
      result({ repetition: 0, scores: { seededRecall: 0.95 } }),
      result({ repetition: 1, scores: { seededRecall: 0.85 } }),
    ]);

    expect(
      compareRuns(baseline, overlapping).filter((f) => f.kind === "regression"),
    ).toEqual([]);

    const regressed = artifact([
      result({ repetition: 0, scores: { seededRecall: 0.5 } }),
      result({ repetition: 1, scores: { seededRecall: 0.6 } }),
    ]);

    const findings = compareRuns(baseline, regressed);
    expect(findings.length).toBe(1);
    expect(findings[0].kind).toBe("regression");
    expect(findings[0].metric).toBe("seededRecall");
  });

  test("flags improvements when the range rises above baseline", () => {
    const baseline = artifact([result({ scores: { seededRecall: 0.5 } })]);
    const improved = artifact([result({ scores: { seededRecall: 1 } })]);

    const findings = compareRuns(baseline, improved);
    expect(findings[0].kind).toBe("improvement");
  });

  test("flags new failures and resolved failures", () => {
    const working = artifact([result({})]);
    const failing = artifact([result({ failed: true, errorClass: "Error" })]);

    const newFailure = compareRuns(working, failing);
    expect(newFailure[0].kind).toBe("new-failure");

    const resolved = compareRuns(failing, working);
    expect(resolved.some((f) => f.kind === "resolved-failure")).toBe(true);
  });

  test("sorts new failures before improvements", () => {
    const baseline = artifact([
      result({ caseId: "a", scores: { x: 0.5 } }),
      result({ caseId: "b" }),
    ]);
    const candidate = artifact([
      result({ caseId: "a", scores: { x: 1 } }),
      result({ caseId: "b", failed: true, errorClass: "Error" }),
    ]);

    const findings = compareRuns(baseline, candidate);
    expect(findings[0].kind).toBe("new-failure");
  });
});

describe("detectDrift", () => {
  test("reports model, version, and prompt hash changes", () => {
    const baseline = artifact([result({})]);
    const candidate = artifact([result({})], "model-b");
    candidate.metadata.toolkitVersion = "0.4.0";
    candidate.metadata.promptHashes = {
      "src/ai/prompts/reviewPrompt.ts": "def",
    };

    const drift = detectDrift(baseline, candidate);

    expect(drift.some((d) => d.includes("model changed"))).toBe(true);
    expect(drift.some((d) => d.includes("toolkit version"))).toBe(true);
    expect(drift.some((d) => d.includes("prompt source"))).toBe(true);
  });

  test("reports nothing when metadata matches", () => {
    const baseline = artifact([result({})]);
    const candidate = artifact([result({})]);
    expect(detectDrift(baseline, candidate)).toEqual([]);
  });
});

describe("rendering", () => {
  test("renderRunReport includes case scores and failures", () => {
    const report = renderRunReport(
      artifact([
        result({}),
        result({
          caseId: "review/broken",
          repetition: 0,
          failed: true,
          errorClass: "Error",
        }),
      ]),
    );

    expect(report).toContain("review/typos-basic [write] ok");
    expect(report).toContain("seededRecall: 1.00");
    expect(report).toContain("FAILED 1/1 (Error)");
  });

  test("renderComparisonReport surfaces drift and token deltas", () => {
    const baseline = artifact([result({ counts: { outputTokens: 100 } })]);
    const candidate = artifact(
      [result({ counts: { outputTokens: 50 } })],
      "model-b",
    );

    const report = renderComparisonReport(baseline, candidate);

    expect(report).toContain("model changed");
    expect(report).toContain("output 100 -> 50 (-50.0%)");
  });
});
