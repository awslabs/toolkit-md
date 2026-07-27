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
 * @fileoverview Eval CLI entry point, run via yarn eval.
 *
 * Deliberately not part of yarn test: evals call real Bedrock, cost real
 * money, and produce scores rather than pass/fail assertions.
 *
 * Usage:
 *   yarn eval                          Run the corpus, print the report
 *   yarn eval --cases <substring>      Run a subset of cases
 *   yarn eval --mode write|edits|both  Restrict the edit-mode matrix
 *   yarn eval --repetitions <n>        Repetitions per case (default 3)
 *   yarn eval --rubric none|all        Enable Tier 3 judging (default none)
 *   yarn eval --baseline <name>        Store the run as a named baseline
 *   yarn eval --compare <name>         Compare the run against a baseline
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { DefaultBedrockClient } from "../src/ai/index.js";
import { loadCorpus } from "./caseLoader.js";
import { runEval } from "./harness.js";
import { renderComparisonReport, renderRunReport } from "./report.js";
import type { RunArtifact } from "./types.js";

const EVALS_DIR = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.join(EVALS_DIR, "corpus");
const RUNS_DIR = path.join(EVALS_DIR, "runs");
const BASELINES_DIR = path.join(RUNS_DIR, "baselines");

const DEFAULT_MODEL = "global.anthropic.claude-sonnet-4-5-20250929-v1:0";
const DEFAULT_JUDGE_MODEL = "global.anthropic.claude-sonnet-4-5-20250929-v1:0";
const DEFAULT_MAX_TOKENS = 32000;

function loadBaseline(name: string): RunArtifact {
  const baselinePath = path.join(BASELINES_DIR, `${name}.json`);

  if (!fs.existsSync(baselinePath)) {
    throw new Error(`Baseline not found: ${baselinePath}`);
  }

  return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
}

function saveArtifact(artifact: RunArtifact, filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const command = new Command("eval")
    .description("Run the toolkit-md eval corpus against real Bedrock models")
    .option("--cases <substring>", "Only run cases whose id contains this")
    .option("--mode <mode>", "Edit mode matrix: write, edits, or both", "both")
    .option("--repetitions <n>", "Repetitions per case x mode", "3")
    .option("--rubric <rubric>", "Tier 3 judging: none or all", "none")
    .option("--model <modelId>", "Model under test", DEFAULT_MODEL)
    .option(
      "--judge-model <modelId>",
      "Pinned judge model",
      DEFAULT_JUDGE_MODEL,
    )
    .option("--max-tokens <n>", "Max output tokens", String(DEFAULT_MAX_TOKENS))
    .option("--request-rate <n>", "Max requests per minute (0 = none)", "0")
    .option("--token-rate <n>", "Max tokens per minute (0 = none)", "0")
    .option("--baseline <name>", "Store this run as a named baseline")
    .option("--compare <name>", "Compare this run against a named baseline")
    .parse(process.argv);

  const options = command.opts();

  const editModes: Array<"write" | "edits"> =
    options.mode === "both" ? ["write", "edits"] : [options.mode];

  if (!editModes.every((m) => m === "write" || m === "edits")) {
    throw new Error(`Invalid mode: ${options.mode}`);
  }

  const rubric = options.rubric as "none" | "all";

  if (rubric !== "none" && rubric !== "all") {
    throw new Error(`Invalid rubric option: ${options.rubric}`);
  }

  const repetitions = Number.parseInt(options.repetitions, 10);

  if (!Number.isInteger(repetitions) || repetitions < 1) {
    throw new Error(`Invalid repetitions: ${options.repetitions}`);
  }

  const cases = loadCorpus(CORPUS_DIR, options.cases);

  if (cases.length === 0) {
    throw new Error(
      options.cases
        ? `No cases match filter: ${options.cases}`
        : `No cases found in ${CORPUS_DIR}`,
    );
  }

  console.log(`Loaded ${cases.length} case(s) from ${CORPUS_DIR}`);

  const maxTokens = Number.parseInt(options.maxTokens, 10);
  const requestRate = Number.parseInt(options.requestRate, 10);
  const tokenRate = Number.parseInt(options.tokenRate, 10);

  const client = new DefaultBedrockClient(
    options.model,
    maxTokens,
    requestRate,
    tokenRate,
  );

  const judgeClient =
    rubric === "all"
      ? new DefaultBedrockClient(
          options.judgeModel,
          maxTokens,
          requestRate,
          tokenRate,
        )
      : undefined;

  const artifact = await runEval(cases, {
    client,
    judgeClient,
    modelId: options.model,
    judgeModelId: rubric === "all" ? options.judgeModel : undefined,
    editModes,
    repetitions,
    rubric,
    log: (message) => console.log(message),
  });

  const runFileName = `run-${artifact.metadata.timestamp.replace(/[:.]/g, "-")}.json`;
  const runPath = path.join(RUNS_DIR, runFileName);
  saveArtifact(artifact, runPath);
  console.log(`\nRun artifact saved to ${runPath}\n`);

  console.log(renderRunReport(artifact));

  if (options.compare) {
    const baseline = loadBaseline(options.compare);
    console.log(`Comparison against baseline '${options.compare}':\n`);
    console.log(renderComparisonReport(baseline, artifact));
  }

  if (options.baseline) {
    const baselinePath = path.join(BASELINES_DIR, `${options.baseline}.json`);
    saveArtifact(artifact, baselinePath);
    console.log(`\nBaseline stored as ${baselinePath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
