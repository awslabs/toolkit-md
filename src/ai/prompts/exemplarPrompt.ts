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
import type { Language } from "../../languages/index.js";
import type { Exemplar } from "./types.js";
import { buildFileList } from "./utils.js";

const template = `{{#if exemplarFiles.length}}
# Exemplar content

The following content has been provided as a reference of what good content looks like and recommendations should follow their style.

There are one or more examples, each contained within <example></example> tags.

Each example may have one or more files across which the content is split, contained within <example_file></example_file> tags.

{{#each exemplarFiles}}
<example path="{{this.path}}">
{{#each this.files}}
<example_file path="{{this.path}}">
{{{this.content}}}
</example_file>
{{/each}}
<example>
{{/each}}
{{/if}}`;

export function buildExemplarPrompt(language: Language, exemplars: Exemplar[]) {
  const promptTemplate = Handlebars.compile(template);

  const exemplarFiles: ExemplarFiles[] = [];

  for (const exemplar of exemplars) {
    exemplarFiles.push({
      path: exemplar.path,
      files: buildFileList(exemplar.nodes, language),
    });
  }

  return promptTemplate({
    exemplarFiles,
  }).trim();
}

interface ExemplarFiles {
  path: string;
  files: File[];
}

interface File {
  path: string;
  content: string;
}
