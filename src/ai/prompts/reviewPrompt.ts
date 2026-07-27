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

export const REVIEW_WRITE_TOOL_NAME = "write_file";

export type ReviewEditMode = "write" | "edits";

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

{{#if editMode}}
Apply your improvements as targeted edits using the "edit_file" tool. Each edit's oldText must match the current file content exactly and appear only once; include surrounding context to make it unique. Use "write_file" only if the changes are too extensive for targeted edits. When you have finished the review call "finish_review" with a one sentence summary. If the file needs no changes after a full review, call "finish_review" immediately - do not make edits just to have something to change.
{{else}}
Write the output as markdown in a similar style to the example content. Provide the complete revised file by calling the "${REVIEW_WRITE_TOOL_NAME}" tool with the file path and the full updated content.
{{/if}}`;

export interface ReviewPromptOptions {
  /** Language the content is written in */
  language: Language;

  /** Strategy for including sibling content in the prompt context */
  contextStrategy: ContextStrategy;

  /** Style guide contents to include in the prompt context */
  styleGuides: string[];

  /** Exemplar content to include in the prompt context */
  exemplars: Exemplar[];

  /** Additional reviewer instructions to include in the prompt */
  instructions?: string;

  /** Whether to attach local images referenced by the content */
  includeImages?: boolean;

  /** Maximum number of images to attach */
  maxImages?: number;

  /** Maximum image size in bytes */
  maxImageSize?: number;

  /** URL prefix indicating a link points to the static directory */
  staticPrefix?: string;

  /** Directory containing static assets */
  staticDir?: string;

  /** Issues found by automated content checks to surface to the model */
  checkIssues?: CheckIssue[];

  /** How the model should return changes (default: whole-file write) */
  editMode?: ReviewEditMode;
}

/**
 * Builds the review prompt for a content node.
 *
 * The prompt instructs the model to return the revised file through the
 * write_file tool rather than as free text.
 *
 * @param tree - Content tree providing prompt context
 * @param currentNode - Node being reviewed
 * @param options - Prompt content and behavior options
 * @returns The prompt, including any attached images
 */
export async function buildReviewPrompt(
  tree: ContentTree,
  currentNode: ContentNode,
  options: ReviewPromptOptions,
): Promise<Prompt> {
  const {
    language,
    contextStrategy,
    styleGuides,
    exemplars,
    instructions,
    includeImages = false,
    maxImages = 5,
    maxImageSize = 3145728,
    staticPrefix,
    staticDir,
    checkIssues,
    editMode = "write",
  } = options;

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
      editMode: editMode === "edits",
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
