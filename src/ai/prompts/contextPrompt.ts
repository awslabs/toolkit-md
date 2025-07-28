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
import type { TreeNode } from "../../content/index.js";
import type { Language } from "../../languages/index.js";

const template = `{{#if styleGuides.length}}
The follow are style guidelines that the content should follow contained between <style></style> tags:
{{#each styleGuides}}
<style>
{{{this}}}
</style>
{{/each}}
{{/if}}

The content to review is written in {{language}} provided in Markdown format below in the <content_files></content_files> tags, with each file enclosed between <file></file> delimiters and includes the path to the file.

<content_files>
{{#each contextFiles}}
<file path="{{this.path}}">
{{{this.content}}}
</file>
{{/each}}
</content_files>

The order of the files in the list should be used when considering changes as they are ordered by how the reader will consume them.

{{#if exemplars.length}}
The following files in the <example_files></example_files> tags contain examples of existing content split across multiple files, with each file enclosed between <example></example>. This content should be used as a reference to what good content looks like and recommendations should follow its style.
<example_files>
{{#each exemplars}}
<example path="{{this.path}}">
{{{this.content}}}
</example>
{{/each}}
</example_files>
{{/if}}
`;

interface File {
  path: string;
  content: string;
}

export function buildContextPrompt(
  contextNodes: TreeNode[],
  language: Language,
  styleGuides: string[],
  exemplarNodes: TreeNode[],
) {
  const promptTemplate = Handlebars.compile(template);

  const contextFiles = buildFileList(contextNodes, language);

  let exemplars: File[] = [];

  if (exemplarNodes) {
    exemplars = buildFileList(exemplarNodes, language);
  }

  return promptTemplate({
    contextFiles,
    styleGuides,
    exemplars,
    language: language.name,
  });
}

function buildFileList(nodes: TreeNode[], language: Language): File[] {
  return nodes
    .filter((e) => e.languages.has(language.code))
    .map((e) => {
      const languageEntry = e.languages.get(language.code);

      return {
        path: e.path,
        // biome-ignore lint/style/noNonNullAssertion: Filtered above
        content: languageEntry!.content,
      };
    });
}
