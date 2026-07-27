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
 * @fileoverview Eval result aggregation, baseline comparison, and rendering.
 *
 * Aggregates repetition results into mean and range per metric, compares
 * runs against a stored baseline, and renders plain-text reports. A
 * regression is flagged only when the candidate's range does not overlap
 * the baseline's range - crude, but resistant to judge noise without
 * requiring large N.
 */

import type { CaseResult, RunArtifact } from "./types.js";

/**
 * Aggregated statistics for one metric at one case x mode point.
 */
export interface MetricStats {
  mean: number;
  min: number;
  max: number;
  samples: number;
}

/**
 * Aggregation of all repetitions at one case x mode point.
 */
export interface CaseAggregate {
  caseId: string;
  operation: string;
  editMode: string;
  repetitions: number;
  failures: number;
  errorClasses: string[];
  scores: Record<string, MetricStats>;
  counts: Record<string, MetricStats>;
}

/**
 * One comparison finding between a run and a baseline.
 */
export interface ComparisonFinding {
  caseId: string;
  editMode: string;
  metric: string;
  kind: "regression" | "improvement" | "new-failure" | "resolved-failure";
  baseline: MetricStats | null;
  candidate: MetricStats | null;
  detail: string;
}

function aggregateValues(values: number[]): MetricStats {
  return {
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    samples: values.length,
  };
}

function groupKey(result: CaseResult): string {
  return `${result.caseId}::${result.editMode}`;
}

/**
 * Aggregates raw case results into per-case x mode statistics.
 *
 * @param results - Raw results from a run
 * @returns Aggregates sorted by case identifier and mode
 */
export function aggregate(results: CaseResult[]): CaseAggregate[] {
  const groups = new Map<string, CaseResult[]>();

  for (const result of results) {
    const key = groupKey(result);
    const group = groups.get(key) ?? [];
    group.push(result);
    groups.set(key, group);
  }

  const aggregates: CaseAggregate[] = [];

  for (const group of groups.values()) {
    const first = group[0];
    const scoreNames = new Set(group.flatMap((r) => Object.keys(r.scores)));
    const countNames = new Set(group.flatMap((r) => Object.keys(r.counts)));

    const scores: Record<string, MetricStats> = {};
    for (const name of scoreNames) {
      const values = group
        .filter((r) => name in r.scores)
        .map((r) => r.scores[name]);
      scores[name] = aggregateValues(values);
    }

    const counts: Record<string, MetricStats> = {};
    for (const name of countNames) {
      const values = group
        .filter((r) => name in r.counts)
        .map((r) => r.counts[name]);
      counts[name] = aggregateValues(values);
    }

    aggregates.push({
      caseId: first.caseId,
      operation: first.operation,
      editMode: first.editMode,
      repetitions: group.length,
      failures: group.filter((r) => r.failed).length,
      errorClasses: Array.from(
        new Set(
          group
            .filter((r) => r.failed && r.errorClass)
            .map((r) => r.errorClass as string),
        ),
      ),
      scores,
      counts,
    });
  }

  return aggregates.sort((a, b) =>
    `${a.caseId}::${a.editMode}`.localeCompare(`${b.caseId}::${b.editMode}`),
  );
}

/**
 * Compares a candidate run against a baseline run.
 *
 * Score regressions and improvements are flagged only when ranges do not
 * overlap. Failure transitions are always flagged: a case that goes from
 * working to throwing is the most important signal the harness produces.
 *
 * @param baseline - Baseline run artifact
 * @param candidate - Candidate run artifact
 * @returns Comparison findings, most severe first
 */
export function compareRuns(
  baseline: RunArtifact,
  candidate: RunArtifact,
): ComparisonFinding[] {
  const findings: ComparisonFinding[] = [];

  const baselineAggregates = new Map(
    aggregate(baseline.results).map((a) => [`${a.caseId}::${a.editMode}`, a]),
  );
  const candidateAggregates = new Map(
    aggregate(candidate.results).map((a) => [`${a.caseId}::${a.editMode}`, a]),
  );

  for (const [key, cand] of candidateAggregates) {
    const base = baselineAggregates.get(key);

    if (!base) {
      continue;
    }

    if (base.failures === 0 && cand.failures > 0) {
      findings.push({
        caseId: cand.caseId,
        editMode: cand.editMode,
        metric: "completion",
        kind: "new-failure",
        baseline: null,
        candidate: null,
        detail: `now failing ${cand.failures}/${cand.repetitions} (${cand.errorClasses.join(", ")})`,
      });
    }

    if (base.failures > 0 && cand.failures === 0) {
      findings.push({
        caseId: cand.caseId,
        editMode: cand.editMode,
        metric: "completion",
        kind: "resolved-failure",
        baseline: null,
        candidate: null,
        detail: `previously failing ${base.failures}/${base.repetitions}, now passing`,
      });
    }

    for (const [metric, candStats] of Object.entries(cand.scores)) {
      const baseStats = base.scores[metric];

      if (!baseStats) {
        continue;
      }

      if (candStats.max < baseStats.min) {
        findings.push({
          caseId: cand.caseId,
          editMode: cand.editMode,
          metric,
          kind: "regression",
          baseline: baseStats,
          candidate: candStats,
          detail: `range [${formatScore(candStats.min)}, ${formatScore(candStats.max)}] fell below baseline [${formatScore(baseStats.min)}, ${formatScore(baseStats.max)}]`,
        });
      } else if (candStats.min > baseStats.max) {
        findings.push({
          caseId: cand.caseId,
          editMode: cand.editMode,
          metric,
          kind: "improvement",
          baseline: baseStats,
          candidate: candStats,
          detail: `range [${formatScore(candStats.min)}, ${formatScore(candStats.max)}] rose above baseline [${formatScore(baseStats.min)}, ${formatScore(baseStats.max)}]`,
        });
      }
    }
  }

  const severity: Record<ComparisonFinding["kind"], number> = {
    "new-failure": 0,
    regression: 1,
    "resolved-failure": 2,
    improvement: 3,
  };

  return findings.sort((a, b) => severity[a.kind] - severity[b.kind]);
}

/**
 * Detects provenance drift between two runs.
 *
 * @param baseline - Baseline run artifact
 * @param candidate - Candidate run artifact
 * @returns Human-readable drift descriptions, empty when nothing moved
 */
export function detectDrift(
  baseline: RunArtifact,
  candidate: RunArtifact,
): string[] {
  const drift: string[] = [];

  if (baseline.metadata.modelId !== candidate.metadata.modelId) {
    drift.push(
      `model changed: ${baseline.metadata.modelId} -> ${candidate.metadata.modelId}`,
    );
  }

  if (baseline.metadata.judgeModelId !== candidate.metadata.judgeModelId) {
    drift.push(
      `judge model changed: ${baseline.metadata.judgeModelId ?? "none"} -> ${candidate.metadata.judgeModelId ?? "none"}`,
    );
  }

  if (baseline.metadata.toolkitVersion !== candidate.metadata.toolkitVersion) {
    drift.push(
      `toolkit version changed: ${baseline.metadata.toolkitVersion} -> ${candidate.metadata.toolkitVersion}`,
    );
  }

  const allPromptKeys = new Set([
    ...Object.keys(baseline.metadata.promptHashes),
    ...Object.keys(candidate.metadata.promptHashes),
  ]);

  for (const key of allPromptKeys) {
    if (
      baseline.metadata.promptHashes[key] !==
      candidate.metadata.promptHashes[key]
    ) {
      drift.push(`prompt source changed: ${key}`);
    }
  }

  return drift;
}

function formatScore(value: number): string {
  return value.toFixed(2);
}

/**
 * Renders a run's aggregates as a plain-text report.
 *
 * @param artifact - Run artifact to render
 * @returns Multi-line report text
 */
export function renderRunReport(artifact: RunArtifact): string {
  const lines: string[] = [];
  const aggregates = aggregate(artifact.results);

  lines.push(`Eval run ${artifact.metadata.timestamp}`);
  lines.push(`  model: ${artifact.metadata.modelId}`);

  if (artifact.metadata.judgeModelId) {
    lines.push(`  judge: ${artifact.metadata.judgeModelId}`);
  }

  lines.push(
    `  toolkit: ${artifact.metadata.toolkitVersion}, repetitions: ${artifact.metadata.repetitions}, rubric: ${artifact.metadata.rubric}`,
  );
  lines.push("");

  for (const agg of aggregates) {
    const status =
      agg.failures === 0
        ? "ok"
        : `FAILED ${agg.failures}/${agg.repetitions} (${agg.errorClasses.join(", ")})`;

    lines.push(`${agg.caseId} [${agg.editMode}] ${status}`);

    for (const [metric, stats] of Object.entries(agg.scores).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const range =
        stats.samples > 1
          ? ` (range ${formatScore(stats.min)}-${formatScore(stats.max)})`
          : "";
      lines.push(`  ${metric}: ${formatScore(stats.mean)}${range}`);
    }

    const tokenMetrics = ["inputTokens", "outputTokens", "durationMs"];
    const tokenParts = tokenMetrics
      .filter((m) => m in agg.counts)
      .map((m) => `${m}=${Math.round(agg.counts[m].mean)}`);

    if (tokenParts.length > 0) {
      lines.push(`  ${tokenParts.join(", ")}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Renders a comparison against a baseline as a plain-text report.
 *
 * @param baseline - Baseline run artifact
 * @param candidate - Candidate run artifact
 * @returns Multi-line report text
 */
export function renderComparisonReport(
  baseline: RunArtifact,
  candidate: RunArtifact,
): string {
  const lines: string[] = [];

  const drift = detectDrift(baseline, candidate);

  if (drift.length > 0) {
    lines.push("Drift detected between baseline and candidate:");
    for (const item of drift) {
      lines.push(`  ! ${item}`);
    }
    lines.push("");
  }

  const findings = compareRuns(baseline, candidate);

  if (findings.length === 0) {
    lines.push("No significant differences from baseline.");
  } else {
    for (const finding of findings) {
      const marker =
        finding.kind === "new-failure" || finding.kind === "regression"
          ? "-"
          : "+";
      lines.push(
        `${marker} [${finding.kind}] ${finding.caseId} [${finding.editMode}] ${finding.metric}: ${finding.detail}`,
      );
    }
  }

  lines.push("");
  lines.push("Token deltas (candidate mean vs baseline mean):");

  const baselineAggregates = new Map(
    aggregate(baseline.results).map((a) => [`${a.caseId}::${a.editMode}`, a]),
  );

  for (const cand of aggregate(candidate.results)) {
    const base = baselineAggregates.get(`${cand.caseId}::${cand.editMode}`);

    if (!base) {
      continue;
    }

    const candOut = cand.counts.outputTokens?.mean;
    const baseOut = base.counts.outputTokens?.mean;

    if (candOut !== undefined && baseOut !== undefined && baseOut > 0) {
      const delta = ((candOut - baseOut) / baseOut) * 100;
      lines.push(
        `  ${cand.caseId} [${cand.editMode}]: output ${Math.round(baseOut)} -> ${Math.round(candOut)} (${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%)`,
      );
    }
  }

  return lines.join("\n");
}
