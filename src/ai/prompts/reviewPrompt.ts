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

import { dirname } from "node:path";
import Handlebars from "handlebars";
import type { CheckIssue } from "../../check/types.js";
import type { ContentNode, ContentTree } from "../../content/index.js";
import { loadImage } from "../../content/utils/markdownUtils.js";
import type { Language } from "../../languages/index.js";
import { buildContextPrompt } from "./contextPrompt.js";
import type { Exemplar, Prompt } from "./types.js";
import { type ContextStrategy, getContext } from "./utils.js";

const template = `Your task is to review the content provided for file "{{file}}" and update it to improve it in terms of style, grammar and syntax.

You MUST not make changes that are whitespace only, this includes:
1. DO NOT change whitespace alignment in Markdown tables
2. DO NOT add or remove trailing newlines at the end of a file

{{#if includeImages}}
The images for the file to review have been included as attachments. Ensure that the descriptions of the images in the Markdown match the contents of each image.
{{/if}}

{{#if checkIssues}}
The following issues were detected by automated content checks:

{{#each checkIssues}}
- Line {{this.line}}: [{{this.severity}}] {{this.message}} ({{this.category}}/{{this.rule}})
{{/each}}

The above issues will highlight if any images or links in the content failed to resolve.
{{/if}}

{{#if instructions}}
In additional you've been provided the following additional instructions:
{{{instructions}}}
{{/if}}

For any finding which cannot be reliably remediated, such as missing images or broken links, leave the offending Markdown but insert a comment above it like so:

<example_comment>
<!-- TMD finding: This image '/pods1.png' could not be loaded -->
[Some screenshot](/pods1.png)
</example_comment>

NOTE: You may not have visibility of the entire directory/file structure so NEVER assume a file is missing or a link is broken unless it has been explicitly highlighted as an issue above.

Write the translated content in a similar style to the example content. Use the write_file tool to output the result to "{{currentNode.filePath}}" in chunks:
- Each chunk is a separate call to write_file
- You MUST NOT write more than ~3000 tokens per chunk (roughly 2000-2500 words)
- Break at natural boundaries: section headers, major paragraphs
- First call: mode="create"
- Subsequent calls: mode="append"
- Continue until complete

Write substantial chunks to minimize tool calls while staying well under the output limit.

You're final response to the user MUST simply be "Success".`;

export async function buildReviewPrompt(
  tree: ContentTree,
  currentNode: ContentNode,
  language: Language,
  contextStrategy: ContextStrategy,
  styleGuides: string[],
  exemplars: Exemplar[],
  instructions?: string,
  includeImages: boolean = false,
  maxImages: number = 5,
  maxImageSize: number = 3145728,
  staticPrefix?: string,
  staticDir?: string,
  checkIssues?: CheckIssue[],
): Promise<Prompt> {
  const promptTemplate = Handlebars.compile(template);

  const contextNodes = getContext(tree, currentNode, contextStrategy);

  const context = buildContextPrompt(
    contextNodes,
    language,
    styleGuides,
    exemplars,
  );

  const prompt: Prompt = {
    context,
    prompt: promptTemplate({
      file: currentNode.filePath,
      instructions,
      includeImages,
      checkIssues: checkIssues && checkIssues.length > 0 ? checkIssues : null,
    }),
    sampleOutput: currentNode.content || undefined,
  };

  if (includeImages && currentNode.content) {
    const baseDir = dirname(currentNode.filePath);

    const results = await Promise.all(
      currentNode.images
        .filter((img) => !img.remote)
        .slice(0, maxImages)
        .map((img) =>
          loadImage(img.path, baseDir, maxImageSize, staticPrefix, staticDir),
        ),
    );

    const images = results.filter(
      (r): r is { bytes: Uint8Array; format: string } => r !== null,
    );

    if (images.length > 0) {
      prompt.images = images;
    }
  }

  return prompt;
}
