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
  gradeBehavioral,
  summarizeTrace,
} from "../../evals/graders/behavioral.js";
import {
  type CaseExecution,
  caseManifestSchema,
  type FileOutcome,
} from "../../evals/types.js";

function execution(overrides: Partial<CaseExecution>): CaseExecution {
  return {
    files: [],
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      estimatedTokens: 90,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 0,
    },
    debugTrace: [],
    durationMs: 1234,
    failed: false,
    ...overrides,
  };
}

function file(overrides: Partial<FileOutcome>): FileOutcome {
  return {
    path: "guide.md",
    input: "original",
    output: "original",
    changed: false,
    kind: "unchanged",
    ...overrides,
  };
}

describe("summarizeTrace", () => {
  test("counts turns, tool calls, and errors", () => {
    const summary = summarizeTrace([
      "Turn 1/10: edit_file -> result",
      "Turn 2/10: edit_file -> error: oldText not found",
      "Turn 3/10: finish_review -> done",
    ]);

    expect(summary.turns).toBe(3);
    expect(summary.toolCalls).toBe(3);
    expect(summary.toolErrors).toBe(1);
  });

  test("handles end_turn lines without tool names", () => {
    const summary = summarizeTrace(["Turn 1: model finished with end_turn"]);
    expect(summary.turns).toBe(1);
    expect(summary.toolCalls).toBe(0);
  });

  test("ignores non-trace lines", () => {
    const summary = summarizeTrace(["something unrelated"]);
    expect(summary.turns).toBe(0);
  });
});

describe("gradeBehavioral", () => {
  const cleanManifest = caseManifestSchema.parse({
    operation: "review",
    description: "clean",
    expectations: { shouldNotChange: ["guide.md"] },
  });

  test("captures token and duration counts", () => {
    const metrics = gradeBehavioral(cleanManifest, execution({}));

    expect(metrics.counts.inputTokens).toBe(100);
    expect(metrics.counts.outputTokens).toBe(50);
    expect(metrics.counts.durationMs).toBe(1234);
    expect(metrics.scores.completion).toBe(1);
  });

  test("computes tool reliability from the trace", () => {
    const metrics = gradeBehavioral(
      cleanManifest,
      execution({
        debugTrace: [
          "Turn 1/10: edit_file -> error: oldText not found",
          "Turn 2/10: edit_file -> result",
          "Turn 3/10: edit_file -> result",
          "Turn 4/10: finish_review -> done",
        ],
      }),
    );

    expect(metrics.scores.toolReliability).toBe(0.75);
  });

  test("scores noop discipline on clean-file review cases", () => {
    const metrics = gradeBehavioral(
      cleanManifest,
      execution({
        files: [
          file({ path: "guide.md", changed: true, kind: "reviewed" }),
          file({ path: "other.md", changed: false, kind: "unchanged" }),
        ],
      }),
    );

    expect(metrics.scores.noopDiscipline).toBe(0.5);
    expect(metrics.counts.noopFalsePositives).toBe(1);
  });

  test("does not score noop discipline when the case seeds errors", () => {
    const seeded = caseManifestSchema.parse({
      operation: "review",
      description: "seeded",
      expectations: {
        mustFix: [{ file: "guide.md", pattern: "x" }],
      },
    });

    const metrics = gradeBehavioral(seeded, execution({}));
    expect(metrics.scores.noopDiscipline).toBeUndefined();
  });

  test("records failure as completion 0 with an explanatory note", () => {
    const metrics = gradeBehavioral(
      cleanManifest,
      execution({
        failed: true,
        errorClass: "Error",
        errorMessage: "Tool use loop did not complete within 10 turns",
      }),
    );

    expect(metrics.scores.completion).toBe(0);
    expect(metrics.notes[0]).toContain("did not complete");
  });
});
