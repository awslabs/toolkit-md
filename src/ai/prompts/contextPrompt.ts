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
import type { ContentNode } from "../../content/index.js";
import type { Language } from "../../languages/index.js";
import { buildExemplarPrompt } from "./exemplarPrompt.js";
import { buildStyleGuidePrompt } from "./styleGuidePrompt.js";
import type { Exemplar } from "./types.js";
import { buildFileList } from "./utils.js";

const template = `{{{styleGuidePrompt}}}

The content is written in {{language}} provided in Markdown format below in the <content_files></content_files> tags, with each file enclosed between <file></file> delimiters and includes the path to the file.

<content_files>
{{#each contextFiles}}
<file path="{{this.path}}">
{{{this.content}}}
</file>
{{/each}}
</content_files>

The order of the files in the list should be used when considering changes as they are ordered by how the reader will consume them.

{{{exemplarPrompt}}}
`;

export function buildContextPrompt(
  contextNodes: ContentNode[],
  language: Language,
  styleGuides: string[],
  exemplars: Exemplar[],
) {
  const promptTemplate = Handlebars.compile(template);

  const contextFiles = buildFileList(contextNodes);

  const styleGuidePrompt = buildStyleGuidePrompt(styleGuides);

  const exemplarPrompt = buildExemplarPrompt(exemplars);

  return promptTemplate({
    contextFiles,
    styleGuidePrompt,
    exemplarPrompt,
    language: language.name,
  }).trim();
}
