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
  gradeExpectations,
  gradeIntegrity,
  gradeTranslationHash,
  gradeWhitespace,
  mergeMetrics,
} from "../../evals/graders/structural.js";
import { caseManifestSchema, type FileOutcome } from "../../evals/types.js";
import { generateHash } from "../../src/content/utils/markdownUtils.js";

function outcome(overrides: Partial<FileOutcome>): FileOutcome {
  return {
    path: "guide.md",
    input: "# Guide\n\nOriginal text.\n",
    output: "# Guide\n\nRevised text.\n",
    changed: true,
    kind: "reviewed",
    ...overrides,
  };
}

function manifest(overrides: Record<string, unknown>) {
  return caseManifestSchema.parse({
    operation: "review",
    description: "test",
    ...overrides,
  });
}

describe("gradeIntegrity", () => {
  test("passes clean output", () => {
    const metrics = gradeIntegrity([outcome({})]);
    expect(metrics.scores.integrity).toBe(1);
  });

  test("fails leaked trailing argument tag", () => {
    const metrics = gradeIntegrity([
      outcome({ output: "# Guide\n\nRevised text.\n</content>" }),
    ]);
    expect(metrics.scores.integrity).toBe(0);
    expect(metrics.notes[0]).toContain("trailing argument tag");
  });

  test("allows tag when the input legitimately ends with it", () => {
    const metrics = gradeIntegrity([
      outcome({
        input: "text\n</content>",
        output: "revised\n</content>",
      }),
    ]);
    expect(metrics.scores.integrity).toBe(1);
  });

  test("fails empty output", () => {
    const metrics = gradeIntegrity([outcome({ output: "   \n" })]);
    expect(metrics.scores.integrity).toBe(0);
  });

  test("fails unparseable frontmatter", () => {
    const metrics = gradeIntegrity([
      outcome({ output: "---\ntitle: [unclosed\n---\ntext\n" }),
    ]);
    expect(metrics.scores.integrity).toBe(0);
  });

  test("scores 1 when nothing was produced", () => {
    const metrics = gradeIntegrity([outcome({ output: null })]);
    expect(metrics.scores.integrity).toBe(1);
    expect(metrics.counts.integrityFilesChecked).toBe(0);
  });
});

describe("gradeWhitespace", () => {
  test("passes when trailing newline is preserved", () => {
    const metrics = gradeWhitespace([outcome({})]);
    expect(metrics.scores.whitespace).toBe(1);
  });

  test("fails when trailing newline is dropped", () => {
    const metrics = gradeWhitespace([
      outcome({ output: "# Guide\n\nRevised text." }),
    ]);
    expect(metrics.scores.whitespace).toBe(0);
    expect(metrics.notes[0]).toContain("trailing newline");
  });

  test("fails whitespace-only changes", () => {
    const metrics = gradeWhitespace([
      outcome({
        input: "# Guide\n\nSame text.\n",
        output: "# Guide  \n\nSame text.\n",
      }),
    ]);
    expect(metrics.scores.whitespace).toBe(0);
    expect(metrics.notes[0]).toContain("whitespace-only");
  });

  test("ignores unchanged files", () => {
    const metrics = gradeWhitespace([outcome({ changed: false })]);
    expect(metrics.counts.whitespaceFilesChecked).toBe(0);
  });
});

describe("gradeTranslationHash", () => {
  const source = "# Guide\n\nSource text.\n";
  const hash = generateHash(source);

  test("passes when output carries the source hash", () => {
    const metrics = gradeTranslationHash(
      [
        outcome({
          kind: "translated",
          output: `---\ntmdTranslationSourceHash: ${hash}\n---\n# Guide\n`,
        }),
      ],
      new Map([["guide.md", source]]),
    );
    expect(metrics.scores.translationHash).toBe(1);
  });

  test("fails when the hash is missing", () => {
    const metrics = gradeTranslationHash(
      [outcome({ kind: "translated", output: "# Guide\n" })],
      new Map([["guide.md", source]]),
    );
    expect(metrics.scores.translationHash).toBe(0);
    expect(metrics.notes[0]).toContain("missing tmdTranslationSourceHash");
  });

  test("fails when the hash does not match the source", () => {
    const metrics = gradeTranslationHash(
      [
        outcome({
          kind: "translated",
          output: `---\ntmdTranslationSourceHash: deadbeef\n---\n# Guide\n`,
        }),
      ],
      new Map([["guide.md", source]]),
    );
    expect(metrics.scores.translationHash).toBe(0);
  });

  test("fails when the legacy key is present", () => {
    const metrics = gradeTranslationHash(
      [
        outcome({
          kind: "translated",
          output: `---\ntmdTranslationSourceHash: ${hash}\nwsmSourceHash: old\n---\n# Guide\n`,
        }),
      ],
      new Map([["guide.md", source]]),
    );
    expect(metrics.scores.translationHash).toBe(0);
    expect(metrics.notes[0]).toContain("legacy key");
  });
});

describe("gradeExpectations", () => {
  test("computes seeded recall from mustFix patterns", () => {
    const m = manifest({
      expectations: {
        mustFix: [
          { file: "guide.md", pattern: "\\brecieve\\b", replacedBy: "receive" },
          { file: "guide.md", pattern: "\\bteh\\b" },
        ],
      },
    });

    const metrics = gradeExpectations(m, [
      outcome({
        input: "You will recieve teh message.\n",
        output: "You will receive teh message.\n",
      }),
    ]);

    expect(metrics.scores.seededRecall).toBe(0.5);
    expect(metrics.counts.seededErrorsFixed).toBe(1);
  });

  test("fails mustFix when the replacement is missing", () => {
    const m = manifest({
      expectations: {
        mustFix: [
          { file: "guide.md", pattern: "\\brecieve\\b", replacedBy: "receive" },
        ],
      },
    });

    const metrics = gradeExpectations(m, [
      outcome({
        input: "You will recieve the message.\n",
        output: "You will get the message.\n",
      }),
    ]);

    expect(metrics.scores.seededRecall).toBe(0);
    expect(metrics.notes[0]).toContain("replacement missing");
  });

  test("verifies mustPreserve matches survive", () => {
    const m = manifest({
      expectations: {
        mustPreserve: [{ file: "guide.md", pattern: "```bash[\\s\\S]*?```" }],
      },
    });

    const preserved = gradeExpectations(m, [
      outcome({
        input: "text\n\n```bash\nkubectl get pods\n```\n",
        output: "revised\n\n```bash\nkubectl get pods\n```\n",
      }),
    ]);
    expect(preserved.scores.preservation).toBe(1);

    const broken = gradeExpectations(m, [
      outcome({
        input: "text\n\n```bash\nkubectl get pods\n```\n",
        output: "revised\n\n```bash\nkubectl get pod\n```\n",
      }),
    ]);
    expect(broken.scores.preservation).toBe(0);
  });

  test("scores shouldChange and shouldNotChange", () => {
    const m = manifest({
      expectations: {
        shouldChange: ["guide.md"],
        shouldNotChange: ["reference.md"],
      },
    });

    const metrics = gradeExpectations(m, [
      outcome({ path: "guide.md", changed: true }),
      outcome({ path: "reference.md", changed: true }),
    ]);

    expect(metrics.scores.shouldChange).toBe(1);
    expect(metrics.scores.shouldNotChange).toBe(0);
    expect(metrics.counts.falsePositiveEdits).toBe(1);
  });
});

describe("mergeMetrics", () => {
  test("unions scores, counts, and notes", () => {
    const merged = mergeMetrics([
      { scores: { a: 1 }, counts: { x: 2 }, notes: ["one"] },
      { scores: { b: 0.5 }, counts: { y: 3 }, notes: ["two"] },
    ]);

    expect(merged.scores).toEqual({ a: 1, b: 0.5 });
    expect(merged.counts).toEqual({ x: 2, y: 3 });
    expect(merged.notes).toEqual(["one", "two"]);
  });
});
