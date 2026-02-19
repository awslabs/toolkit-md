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
import {
  type ContextStrategy,
  extractFileSection,
  getContext,
} from "./utils.js";

const template = `Your task is to review the content provided for file "{{file}}" and update it to improve it in terms of style, grammar and syntax.

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

Write the output as markdown in a similar style to the example content. Respond with the resulting file enclosed in <file></file> including the path to the file as an attribute.

ONLY respond with the content between the "<file></file>" tags.`;

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
    prefill: `<file path="${currentNode.filePath}">`,
    transform: (input) => {
      const fileSection = extractFileSection(input);

      if (fileSection.path !== currentNode.filePath) {
        throw new Error(`Unexpected file path in output: ${fileSection.path}`);
      }

      return fileSection.content;
    },
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
