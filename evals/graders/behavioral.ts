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
 * @fileoverview Tier 2 behavioral graders (deterministic, from events and
 * debug traces).
 *
 * Measures turn efficiency, tool error rate, token economics, noop
 * discipline, and latency. These metrics answer the questions the design
 * doc calls out explicitly: does edit mode save tokens, do clean files
 * produce false-positive edits, and what latency do multi-turn sessions
 * trade for those savings.
 */

import type { CaseExecution, CaseManifest, MetricSet } from "../types.js";

const TOOL_TURN_LINE = /^Turn (\d+)(?:\/\d+)?: (\S+) -> (.+)$/;
const END_TURN_LINE = /^Turn (\d+)(?:\/\d+)?: model finished/;

/**
 * Parsed summary of a debug trace produced by the tool use loop.
 */
export interface TraceSummary {
  turns: number;
  toolCalls: number;
  toolErrors: number;
}

/**
 * Parses the onDebug trace lines emitted by generateWithTools into turn
 * and tool error counts.
 *
 * @param trace - Debug trace lines captured during execution
 * @returns Summary of turns, tool calls, and tool errors
 */
export function summarizeTrace(trace: string[]): TraceSummary {
  let turns = 0;
  let toolCalls = 0;
  let toolErrors = 0;

  for (const line of trace) {
    const endTurn = line.match(END_TURN_LINE);

    if (endTurn) {
      turns = Math.max(turns, Number.parseInt(endTurn[1], 10));
      continue;
    }

    const match = line.match(TOOL_TURN_LINE);

    if (!match) {
      continue;
    }

    turns = Math.max(turns, Number.parseInt(match[1], 10));
    toolCalls++;

    if (match[3].startsWith("error:")) {
      toolErrors++;
    }
  }

  return { turns, toolCalls, toolErrors };
}

/**
 * Runs the behavioral graders over an execution.
 *
 * @param manifest - Case manifest
 * @param execution - Observed execution
 * @returns Behavioral metrics
 */
export function gradeBehavioral(
  manifest: CaseManifest,
  execution: CaseExecution,
): MetricSet {
  const metrics: MetricSet = { scores: {}, counts: {}, notes: [] };

  const trace = summarizeTrace(execution.debugTrace);
  const processedFiles = execution.files.filter(
    (f) => f.kind !== "skipped" && f.kind !== "other",
  );

  metrics.counts.turns = trace.turns;
  metrics.counts.toolCalls = trace.toolCalls;
  metrics.counts.toolErrors = trace.toolErrors;
  metrics.counts.filesProcessed = processedFiles.length;

  metrics.scores.toolReliability =
    trace.toolCalls === 0 ? 1 : 1 - trace.toolErrors / trace.toolCalls;

  metrics.counts.inputTokens = execution.usage.inputTokens;
  metrics.counts.outputTokens = execution.usage.outputTokens;
  metrics.counts.totalTokens = execution.usage.totalTokens;
  metrics.counts.cacheReadInputTokens = execution.usage.cacheReadInputTokens;
  metrics.counts.cacheWriteInputTokens = execution.usage.cacheWriteInputTokens;
  metrics.counts.durationMs = execution.durationMs;

  const cleanFileCase =
    manifest.expectations.shouldChange.length === 0 &&
    manifest.expectations.mustFix.length === 0;

  if (cleanFileCase && manifest.operation === "review") {
    const falsePositives = processedFiles.filter((f) => f.changed).length;
    metrics.counts.noopFalsePositives = falsePositives;
    metrics.scores.noopDiscipline = ratio(
      processedFiles.length - falsePositives,
      processedFiles.length,
    );

    if (falsePositives > 0) {
      metrics.notes.push(
        `noop discipline: ${falsePositives} clean file(s) received edits`,
      );
    }
  }

  metrics.scores.completion = execution.failed ? 0 : 1;

  if (execution.failed) {
    metrics.notes.push(
      `execution failed: ${execution.errorClass ?? "Error"}: ${
        execution.errorMessage ?? "unknown"
      }`,
    );
  }

  return metrics;
}

function ratio(passed: number, total: number): number {
  return total === 0 ? 1 : passed / total;
}
