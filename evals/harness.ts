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
 * @fileoverview Eval harness: runs the corpus x configuration matrix.
 *
 * Executes each case through the real review and translate pipelines
 * against a live model client, captures events, usage, and debug traces,
 * runs the graders, and produces a run artifact. Every case executes in a
 * try/catch: pipeline errors are recorded as metrics rather than aborting
 * the run, because a regression from "works" to "throws" is the most
 * important signal the harness can produce.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { BedrockClient, TokenUsage } from "../src/ai/index.js";
import { ContentTree, MockProvider } from "../src/content/index.js";
import { generateHash } from "../src/content/utils/markdownUtils.js";
import { reviewContent } from "../src/core/review.js";
import { translateContent } from "../src/core/translate.js";
import { Language } from "../src/languages/index.js";
import { gradeBehavioral } from "./graders/behavioral.js";
import { gradeCheckRegression } from "./graders/checks.js";
import { judgeReview, judgeTranslation } from "./graders/judge.js";
import { gradeStructural, mergeMetrics } from "./graders/structural.js";
import type {
  CaseExecution,
  CaseResult,
  EvalCase,
  FileOutcome,
  MetricSet,
  RunArtifact,
  RunMetadata,
} from "./types.js";

const EVALS_DIR = path.dirname(fileURLToPath(import.meta.url));

const PROMPT_SOURCES = [
  "src/ai/prompts/reviewPrompt.ts",
  "src/ai/prompts/translatePrompt.ts",
  "src/core/fileEditSession.ts",
  "src/core/fileWriteTool.ts",
];

export interface HarnessOptions {
  /** Client for the model under test */
  client: BedrockClient;

  /** Client for the pinned judge model, when rubric grading is enabled */
  judgeClient?: BedrockClient;

  /** Model identifier of the model under test, for run metadata */
  modelId: string;

  /** Model identifier of the judge, for run metadata */
  judgeModelId?: string;

  /** Edit modes to run; cases pinning a mode run only that mode */
  editModes: Array<"write" | "edits">;

  /** Repetitions per case x mode point */
  repetitions: number;

  /** Whether Tier 3 rubric grading runs */
  rubric: "none" | "all";

  /** Progress sink */
  log: (message: string) => void;
}

function emptyUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedTokens: 0,
    cacheReadInputTokens: 0,
    cacheWriteInputTokens: 0,
  };
}

function addUsage(total: TokenUsage, delta: TokenUsage): void {
  total.inputTokens += delta.inputTokens;
  total.outputTokens += delta.outputTokens;
  total.totalTokens += delta.totalTokens;
  total.estimatedTokens += delta.estimatedTokens;
  total.cacheReadInputTokens += delta.cacheReadInputTokens;
  total.cacheWriteInputTokens += delta.cacheWriteInputTokens;
}

function buildTree(
  evalCase: EvalCase,
  language: string,
  defaultLanguage: string,
): ContentTree {
  const provider = new MockProvider(evalCase.content);
  const tree = new ContentTree(provider, {
    defaultLanguage,
    language,
  });
  evalCase.content.forEach(({ path: filePath, content }) =>
    tree.add(filePath, content),
  );
  return tree;
}

function resolveLanguage(code: string): Language {
  const language = Language.getLanguage(code);

  if (!language) {
    throw new Error(`Unsupported language code in case manifest: ${code}`);
  }

  return language;
}

/**
 * Executes a review case once and captures the outcome per file.
 */
async function executeReviewCase(
  evalCase: EvalCase,
  client: BedrockClient,
  editMode: "write" | "edits",
): Promise<CaseExecution> {
  const manifest = evalCase.manifest;
  const language = resolveLanguage(manifest.sourceLanguage);
  const tree = buildTree(
    evalCase,
    manifest.sourceLanguage,
    manifest.sourceLanguage,
  );

  const files = new Map<string, FileOutcome>();
  const debugTrace: string[] = [];
  const usage = emptyUsage();
  const started = Date.now();

  let failed = false;
  let errorClass: string | undefined;
  let errorMessage: string | undefined;

  try {
    await reviewContent(
      {
        tree,
        client,
        language,
        contextStrategy: manifest.settings.contextStrategy ?? "nothing",
        styleGuides: evalCase.styleGuides,
        exemplars: [],
        instructions: manifest.settings.instructions,
        diffContext: 3,
        checkOptions: null,
        write: false,
        includeImages: false,
        maxImages: 5,
        maxImageSize: 3145728,
        cacheEnabled: false,
        editMode,
        onDebug: (message) => debugTrace.push(message),
      },
      (event) => {
        switch (event.kind) {
          case "reviewed":
            files.set(event.node.filePath, {
              path: event.node.filePath,
              input: event.original,
              output: event.revised,
              changed: event.original !== event.revised,
              kind: "reviewed",
            });
            addUsage(usage, event.usage);
            break;
          case "unchanged":
            files.set(event.node.filePath, {
              path: event.node.filePath,
              input: event.node.content,
              output: event.node.content,
              changed: false,
              kind: "unchanged",
            });
            addUsage(usage, event.usage);
            break;
          default:
            break;
        }
      },
    );
  } catch (error) {
    failed = true;
    errorClass = error instanceof Error ? error.constructor.name : "Error";
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  return {
    files: Array.from(files.values()),
    usage,
    debugTrace,
    durationMs: Date.now() - started,
    failed,
    errorClass,
    errorMessage,
  };
}

/**
 * Executes a translate case once and captures the outcome per source file.
 */
async function executeTranslateCase(
  evalCase: EvalCase,
  client: BedrockClient,
  editMode: "write" | "edits",
): Promise<{
  execution: CaseExecution;
  previousTranslations: Map<string, string>;
}> {
  const manifest = evalCase.manifest;

  if (!manifest.targetLanguage) {
    throw new Error(
      `Case ${evalCase.id} is a translate case but has no targetLanguage`,
    );
  }

  const sourceLanguage = resolveLanguage(manifest.sourceLanguage);
  const targetLanguage = resolveLanguage(manifest.targetLanguage);

  const sourceTree = buildTree(
    evalCase,
    manifest.sourceLanguage,
    manifest.sourceLanguage,
  );
  const targetTree = buildTree(
    evalCase,
    manifest.targetLanguage,
    manifest.sourceLanguage,
  );

  const previousTranslations = new Map<string, string>();

  for (const node of sourceTree.getFlattenedTree()) {
    const existing = targetTree.getNode(node.path);
    if (existing?.content) {
      previousTranslations.set(node.filePath, existing.content);
    }
  }

  const files = new Map<string, FileOutcome>();
  const debugTrace: string[] = [];
  const usage = emptyUsage();
  const started = Date.now();

  let failed = false;
  let errorClass: string | undefined;
  let errorMessage: string | undefined;

  try {
    await translateContent(
      {
        sourceTree,
        targetTree,
        client,
        sourceLanguage,
        targetLanguage,
        contextStrategy: manifest.settings.contextStrategy ?? "nothing",
        styleGuides: evalCase.styleGuides,
        exemplars: [],
        force: manifest.settings.force ?? false,
        checkOnly: false,
        write: true,
        cacheEnabled: false,
        editMode,
        onDebug: (message) => debugTrace.push(message),
      },
      (event) => {
        switch (event.kind) {
          case "translated":
            files.set(event.node.filePath, {
              path: event.node.filePath,
              input: event.node.content,
              output: event.output,
              changed: true,
              kind: "translated",
            });
            addUsage(usage, event.usage);
            break;
          case "skipped":
            files.set(event.node.filePath, {
              path: event.node.filePath,
              input: event.node.content,
              output: previousTranslations.get(event.node.filePath) ?? null,
              changed: false,
              kind: "skipped",
            });
            break;
          default:
            break;
        }
      },
    );
  } catch (error) {
    failed = true;
    errorClass = error instanceof Error ? error.constructor.name : "Error";
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  return {
    execution: {
      files: Array.from(files.values()),
      usage,
      debugTrace,
      durationMs: Date.now() - started,
      failed,
      errorClass,
      errorMessage,
    },
    previousTranslations,
  };
}

/**
 * Runs a single case at one matrix point and grades the execution.
 *
 * @param evalCase - Case to run
 * @param editMode - Edit mode for this matrix point
 * @param repetition - Repetition index for the result record
 * @param options - Harness options
 * @returns The graded case result
 */
export async function runCase(
  evalCase: EvalCase,
  editMode: "write" | "edits",
  repetition: number,
  options: HarnessOptions,
): Promise<CaseResult> {
  const manifest = evalCase.manifest;

  let execution: CaseExecution;
  let previousTranslations = new Map<string, string>();

  if (manifest.operation === "review") {
    execution = await executeReviewCase(evalCase, options.client, editMode);
  } else {
    const result = await executeTranslateCase(
      evalCase,
      options.client,
      editMode,
    );
    execution = result.execution;
    previousTranslations = result.previousTranslations;
  }

  const sourceContentByPath = new Map(
    evalCase.content.map(({ path: filePath, content }) => [filePath, content]),
  );

  const metricSets: MetricSet[] = [
    gradeStructural(manifest, execution, sourceContentByPath),
    gradeBehavioral(manifest, execution),
  ];

  const outputLocale =
    manifest.operation === "translate"
      ? (manifest.targetLanguage ?? "en")
      : manifest.sourceLanguage;

  metricSets.push(await gradeCheckRegression(execution.files, outputLocale));

  const rubricEnabled =
    options.rubric === "all" &&
    options.judgeClient !== undefined &&
    manifest.rubric !== "none" &&
    !execution.failed;

  if (rubricEnabled && options.judgeClient) {
    if (manifest.operation === "review") {
      metricSets.push(await judgeReview(options.judgeClient, execution.files));
    } else if (manifest.targetLanguage) {
      metricSets.push(
        await judgeTranslation(
          options.judgeClient,
          execution.files,
          resolveLanguage(manifest.targetLanguage).name,
          previousTranslations,
        ),
      );
    }
  }

  const merged = mergeMetrics(metricSets);

  return {
    caseId: evalCase.id,
    operation: manifest.operation,
    editMode,
    repetition,
    failed: execution.failed,
    errorClass: execution.errorClass,
    errorMessage: execution.errorMessage,
    durationMs: execution.durationMs,
    usage: execution.usage,
    scores: merged.scores,
    counts: merged.counts,
    notes: merged.notes,
  };
}

/**
 * Computes hashes of the prompt template source files for drift detection.
 *
 * @returns Prompt hashes keyed by repository-relative source path
 */
export function computePromptHashes(): Record<string, string> {
  const repoRoot = path.resolve(EVALS_DIR, "..");
  const hashes: Record<string, string> = {};

  for (const source of PROMPT_SOURCES) {
    const fullPath = path.join(repoRoot, source);

    if (fs.existsSync(fullPath)) {
      hashes[source] = generateHash(fs.readFileSync(fullPath, "utf8"));
    }
  }

  return hashes;
}

/**
 * Reads the toolkit version from package.json.
 */
export function readToolkitVersion(): string {
  const packagePath = path.resolve(EVALS_DIR, "..", "package.json");
  return JSON.parse(fs.readFileSync(packagePath, "utf8")).version ?? "unknown";
}

/**
 * Runs the full corpus x configuration matrix.
 *
 * @param cases - Corpus cases to run
 * @param options - Harness options
 * @returns The complete run artifact
 */
export async function runEval(
  cases: EvalCase[],
  options: HarnessOptions,
): Promise<RunArtifact> {
  const metadata: RunMetadata = {
    timestamp: new Date().toISOString(),
    modelId: options.modelId,
    judgeModelId: options.judgeModelId,
    toolkitVersion: readToolkitVersion(),
    promptHashes: computePromptHashes(),
    repetitions: options.repetitions,
    rubric: options.rubric,
  };

  const results: CaseResult[] = [];

  for (const evalCase of cases) {
    const pinnedMode = evalCase.manifest.settings.editMode;
    const modes = pinnedMode ? [pinnedMode] : options.editModes;

    for (const editMode of modes) {
      for (let rep = 0; rep < options.repetitions; rep++) {
        options.log(
          `Running ${evalCase.id} [${editMode}] rep ${rep + 1}/${options.repetitions}`,
        );

        const result = await runCase(evalCase, editMode, rep, options);
        results.push(result);

        if (result.failed) {
          options.log(`  FAILED: ${result.errorClass}: ${result.errorMessage}`);
        }
      }
    }
  }

  return { metadata, results };
}
