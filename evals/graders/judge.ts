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
 * @fileoverview Tier 3 model-graded rubrics (LLM judge).
 *
 * Judges quality dimensions that cannot be checked mechanically, using
 * structured output through the existing client. The judge model is pinned
 * independently of the model under test, sees original and output (plus
 * the previous translation for re-translation cases), and never sees
 * another candidate's score.
 */

import { z } from "zod";
import type { BedrockClient } from "../../src/ai/index.js";
import type { FileOutcome, MetricSet } from "../types.js";

const reviewJudgeSchema = z.object({
  improvement: z
    .number()
    .min(1)
    .max(5)
    .describe(
      "Are the changes genuine improvements to style, grammar, and syntax? 1 = changes make the document worse, 5 = every change is a clear improvement",
    ),
  meaningPreservation: z
    .number()
    .min(1)
    .max(5)
    .describe(
      "Is the meaning of the original preserved? 1 = meaning changed or facts introduced/lost, 5 = meaning fully intact",
    ),
  styleConsistency: z
    .number()
    .min(1)
    .max(5)
    .describe(
      "Are the changes consistent with the style of the surrounding document? 1 = jarring inconsistencies, 5 = seamless",
    ),
  justification: z
    .string()
    .describe("Two or three sentences justifying the scores"),
});

const translateJudgeSchema = z.object({
  fluency: z
    .number()
    .min(1)
    .max(5)
    .describe(
      "Is the translation fluent and natural in the target language? 1 = unreadable or machine-like, 5 = reads as native",
    ),
  accuracy: z
    .number()
    .min(1)
    .max(5)
    .describe(
      "Does the translation faithfully convey the source content? 1 = omissions or mistranslations, 5 = fully accurate",
    ),
  codeHandling: z
    .number()
    .min(1)
    .max(5)
    .describe(
      "Are code blocks, commands, and log output left untranslated while comments inside them are translated? 1 = code corrupted or translated, 5 = handled exactly right",
    ),
  terminologyConsistency: z
    .number()
    .min(1)
    .max(5)
    .describe(
      "Is terminology consistent within the document and with the previous translation if provided? 1 = same term rendered differently throughout, 5 = fully consistent",
    ),
  justification: z
    .string()
    .describe("Two or three sentences justifying the scores"),
});

function buildReviewJudgePrompt(file: FileOutcome): string {
  return `You are evaluating the quality of an automated content review. The reviewer was asked to improve style, grammar, and syntax without changing meaning.

Score the revision against the rubric. Base scores only on the differences between the two versions.

<original file="${file.path}">
${file.input}
</original>

<revised file="${file.path}">
${file.output}
</revised>`;
}

function buildTranslateJudgePrompt(
  file: FileOutcome,
  targetLanguage: string,
  previousTranslation?: string,
): string {
  const previousSection = previousTranslation
    ? `\n<previousTranslation>\n${previousTranslation}\n</previousTranslation>\n`
    : "";

  return `You are evaluating the quality of an automated translation into ${targetLanguage}. Code blocks, terminal commands, and sample log output must remain untranslated, but human-language comments inside code blocks must be translated.

Score the translation against the rubric.${previousTranslation ? " A previous translation of an earlier version of this document is provided; terminology should stay consistent with it." : ""}

<source file="${file.path}">
${file.input}
</source>

<translation file="${file.path}">
${file.output}
</translation>
${previousSection}`;
}

/**
 * Judges reviewed files against the review-quality rubric.
 *
 * @param client - Judge model client (pinned, independent of model under test)
 * @param files - Per-file outcomes; only changed files with output are judged
 * @returns Judge metrics averaged across files, normalized to 0-1
 */
export async function judgeReview(
  client: BedrockClient,
  files: FileOutcome[],
): Promise<MetricSet> {
  const metrics: MetricSet = { scores: {}, counts: {}, notes: [] };
  const candidates = files.filter(
    (f) => f.changed && f.input !== null && f.output !== null,
  );

  if (candidates.length === 0) {
    return metrics;
  }

  const dimensions = {
    improvement: [] as number[],
    meaningPreservation: [] as number[],
    styleConsistency: [] as number[],
  };

  for (const file of candidates) {
    const response = await client.generate(
      {
        prompt: buildReviewJudgePrompt(file),
        outputSchema: {
          schema: reviewJudgeSchema,
          name: "review_quality",
          description: "Rubric scores for a content review",
        },
      },
      false,
    );

    const parsed = reviewJudgeSchema.parse(JSON.parse(response.output));

    dimensions.improvement.push(parsed.improvement);
    dimensions.meaningPreservation.push(parsed.meaningPreservation);
    dimensions.styleConsistency.push(parsed.styleConsistency);
    metrics.notes.push(`judge ${file.path}: ${parsed.justification}`);
  }

  metrics.scores.judgeImprovement = normalize(dimensions.improvement);
  metrics.scores.judgeMeaningPreservation = normalize(
    dimensions.meaningPreservation,
  );
  metrics.scores.judgeStyleConsistency = normalize(dimensions.styleConsistency);
  metrics.counts.judgedFiles = candidates.length;

  return metrics;
}

/**
 * Judges translated files against the translate-quality rubric.
 *
 * @param client - Judge model client (pinned, independent of model under test)
 * @param files - Per-file outcomes; only translated files are judged
 * @param targetLanguage - Name of the target language for the judge prompt
 * @param previousTranslations - Previous translations keyed by path, for
 *   re-translation terminology consistency
 * @returns Judge metrics averaged across files, normalized to 0-1
 */
export async function judgeTranslation(
  client: BedrockClient,
  files: FileOutcome[],
  targetLanguage: string,
  previousTranslations: Map<string, string>,
): Promise<MetricSet> {
  const metrics: MetricSet = { scores: {}, counts: {}, notes: [] };
  const candidates = files.filter(
    (f) => f.kind === "translated" && f.input !== null && f.output !== null,
  );

  if (candidates.length === 0) {
    return metrics;
  }

  const dimensions = {
    fluency: [] as number[],
    accuracy: [] as number[],
    codeHandling: [] as number[],
    terminologyConsistency: [] as number[],
  };

  for (const file of candidates) {
    const response = await client.generate(
      {
        prompt: buildTranslateJudgePrompt(
          file,
          targetLanguage,
          previousTranslations.get(file.path),
        ),
        outputSchema: {
          schema: translateJudgeSchema,
          name: "translate_quality",
          description: "Rubric scores for a translation",
        },
      },
      false,
    );

    const parsed = translateJudgeSchema.parse(JSON.parse(response.output));

    dimensions.fluency.push(parsed.fluency);
    dimensions.accuracy.push(parsed.accuracy);
    dimensions.codeHandling.push(parsed.codeHandling);
    dimensions.terminologyConsistency.push(parsed.terminologyConsistency);
    metrics.notes.push(`judge ${file.path}: ${parsed.justification}`);
  }

  metrics.scores.judgeFluency = normalize(dimensions.fluency);
  metrics.scores.judgeAccuracy = normalize(dimensions.accuracy);
  metrics.scores.judgeCodeHandling = normalize(dimensions.codeHandling);
  metrics.scores.judgeTerminologyConsistency = normalize(
    dimensions.terminologyConsistency,
  );
  metrics.counts.judgedFiles = candidates.length;

  return metrics;
}

function normalize(scores: number[]): number {
  if (scores.length === 0) {
    return 1;
  }

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return (mean - 1) / 4;
}
