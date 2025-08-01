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
import type { Prompt } from "./types.js";

const template = `Your task to generate a summary table of a list of content changes that have been proposed for a human to easily review. 

The changes are provided as file diffs.

The summary should be presented as a Markdown table. Try to separate and group each logical change in each file in to a separate row. DO NOT group all changes in a file together unless they are the same logical change. 

Use the following columns:

- Suggestion: A description of the suggested change and its justification
- File: A link to the file and line number for the suggested change

Here is an example table, where the change was on line 42 based on the diff:

| Suggestion | File |
| ---------- | ---- |
| <details><summary>Fix subject-verb agreement</summary>Change "The functions is" to "The functions are" for proper grammar</details>    |  [docs/guide.md:42](docs/guide.md#L42) |

<file_diffs>
{{#each diffs}}
<file_diff path="{{this.path}}">
{{{this.diff}}}
</file_diff>
{{/each}}
</file_diffs>`;

export interface FileDiff {
  path: string;
  diff: string;
}

export function buildSummarizePrompt(diffs: FileDiff[]): Prompt {
  const promptTemplate = Handlebars.compile(template);

  return {
    prompt: promptTemplate({
      diffs,
    }),
    prefill: "| Suggestion",
  };
}
