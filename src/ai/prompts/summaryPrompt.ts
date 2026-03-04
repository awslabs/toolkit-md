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

import Handlebars from "handlebars";
import { z } from "zod";
import type { Prompt } from "./types.js";

const template = `Your task is to analyze a list of content changes provided as file diffs and extract each logical change as a structured suggestion.

Separate and group each logical change in each file into a separate suggestion. DO NOT group all changes in a file together unless they are the same logical change.

For each suggestion provide:
- summary: A short title describing the change
- description: A detailed explanation of the change and its justification
- file: The file path
- line: The line number where the change occurs based on the diff

<file_diffs>
{{#each diffs}}
<file_diff path="{{this.path}}">
{{{this.diff}}}
</file_diff>
{{/each}}
</file_diffs>`;

const summaryTableTemplate = Handlebars.compile(
  `| Suggestion | File |
| ---------- | ---- |
{{#each suggestions}}
| <details><summary>{{{this.summary}}}</summary>{{{this.description}}}</details> | [{{{this.file}}}:{{{this.line}}}]({{{this.file}}}#L{{{this.line}}}) |
{{/each}}`,
);

const suggestionEntrySchema = z.object({
  summary: z.string().describe("Short title describing the suggested change"),
  description: z
    .string()
    .describe("Detailed explanation of the change and its justification"),
  file: z.string().describe("File path where the change occurs"),
  line: z
    .number()
    .describe("Line number of the change based on the diff context"),
});

const outputSchema = z.object({
  suggestions: z.array(suggestionEntrySchema),
});

export type SuggestionEntry = z.infer<typeof suggestionEntrySchema>;

export interface FileDiff {
  path: string;
  diff: string;
}

export function formatSummaryTable(suggestions: SuggestionEntry[]): string {
  return summaryTableTemplate({ suggestions });
}

export function buildSummarizePrompt(diffs: FileDiff[]): Prompt {
  const promptTemplate = Handlebars.compile(template);

  return {
    prompt: promptTemplate({ diffs }),
    outputSchema: {
      schema: outputSchema,
      name: "change_summary",
      description: "Structured summary of content change suggestions",
    },
    transform: (input: string) => {
      const parsed = outputSchema.parse(JSON.parse(input));
      return formatSummaryTable(parsed.suggestions);
    },
  };
}
