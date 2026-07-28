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
 * @fileoverview Type definitions for the eval mechanism.
 *
 * Defines the case manifest schema, per-case run results, grader outputs,
 * and the run artifact format persisted to disk and used for baseline
 * comparison. See docs/eval-design.md for the overall design.
 */

import { z } from "zod";
import type { TokenUsage } from "../src/ai/index.js";

/**
 * A seeded error the operation is expected to fix. The pattern must no
 * longer match the output; when replacedBy is given it must appear.
 */
export const seededFixSchema = z.object({
  file: z.string(),
  pattern: z.string(),
  replacedBy: z.string().optional(),
});

/**
 * Content that must survive the operation untouched. Every match of the
 * pattern in the input must appear verbatim in the output.
 */
export const seededPreserveSchema = z.object({
  file: z.string(),
  pattern: z.string(),
});

export const caseExpectationsSchema = z.object({
  shouldChange: z.array(z.string()).default([]),
  shouldNotChange: z.array(z.string()).default([]),
  mustFix: z.array(seededFixSchema).default([]),
  mustPreserve: z.array(seededPreserveSchema).default([]),
});

export const caseSettingsSchema = z.object({
  contextStrategy: z.enum(["siblings", "nothing", "everything"]).optional(),
  editMode: z.enum(["write", "edits"]).optional(),
  instructions: z.string().optional(),
  force: z.boolean().optional(),
  styleGuides: z.array(z.string()).default([]),
});

/**
 * Case manifest loaded from case.json in each corpus case directory.
 */
export const caseManifestSchema = z.object({
  operation: z.enum(["review", "translate"]),
  description: z.string(),
  settings: caseSettingsSchema.default({ styleGuides: [] }),
  expectations: caseExpectationsSchema.default({
    shouldChange: [],
    shouldNotChange: [],
    mustFix: [],
    mustPreserve: [],
  }),
  rubric: z.enum(["review-quality", "translate-quality", "none"]).optional(),
  targetLanguage: z.string().optional(),
  sourceLanguage: z.string().default("en"),
});

export type SeededFix = z.infer<typeof seededFixSchema>;
export type SeededPreserve = z.infer<typeof seededPreserveSchema>;
export type CaseExpectations = z.infer<typeof caseExpectationsSchema>;
export type CaseSettings = z.infer<typeof caseSettingsSchema>;
export type CaseManifest = z.infer<typeof caseManifestSchema>;

/**
 * A corpus case resolved from disk: its manifest plus the raw content
 * entries that seed the in-memory tree for each run.
 */
export interface EvalCase {
  id: string;
  dir: string;
  manifest: CaseManifest;
  content: Array<{ path: string; content: string }>;
  styleGuides: string[];
}

/**
 * Per-file input/output pair captured from a pipeline run.
 */
export interface FileOutcome {
  path: string;
  input: string | null;
  output: string | null;
  changed: boolean;
  kind: "reviewed" | "unchanged" | "translated" | "skipped" | "other";
}

/**
 * Everything observed while executing a single case once.
 */
export interface CaseExecution {
  files: FileOutcome[];
  usage: TokenUsage;
  debugTrace: string[];
  durationMs: number;
  failed: boolean;
  errorClass?: string;
  errorMessage?: string;
}

/**
 * A named metric produced by a grader. Scores are on a 0-1 scale; counts
 * carry the underlying raw numbers for the report.
 */
export interface MetricSet {
  scores: Record<string, number>;
  counts: Record<string, number>;
  notes: string[];
}

/**
 * The full result of one case at one configuration point and repetition.
 */
export interface CaseResult {
  caseId: string;
  operation: "review" | "translate";
  editMode: "write" | "edits";
  repetition: number;
  failed: boolean;
  errorClass?: string;
  errorMessage?: string;
  durationMs: number;
  usage: TokenUsage;
  scores: Record<string, number>;
  counts: Record<string, number>;
  notes: string[];
}

/**
 * Provenance metadata stamped on every run so drifted comparisons are
 * detected rather than silently misleading.
 */
export interface RunMetadata {
  timestamp: string;
  modelId: string;
  judgeModelId?: string;
  toolkitVersion: string;
  promptHashes: Record<string, string>;
  repetitions: number;
  rubric: "none" | "all";
}

/**
 * The persisted artifact for a full eval run.
 */
export interface RunArtifact {
  metadata: RunMetadata;
  results: CaseResult[];
}
