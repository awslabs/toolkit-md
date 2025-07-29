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
import {
  type LanguageContent,
  type MarkdownTree,
  TRANSLATION_SRC_HASH_KEY,
  type TreeNode,
} from "../../content/index.js";
import type { Language } from "../../languages/index.js";
import { buildContextPrompt } from "./contextPrompt.js";
import type { Prompt } from "./types.js";
import {
  type ContextStrategy,
  extractFileSection,
  getContext,
} from "./utils.js";

const template = `Your task is to translate the content provided for file "{{currentNode.path}}" to {{targetLanguage.name}} ({{targetLanguage.code}}).

DO NOT make any changes not related to translating the content
ALWAYS return the entire translated file, do not abbreviate it
ALWAYS add or update the Markdown frontmatter with a key '${TRANSLATION_SRC_HASH_KEY}' with value '{{sourceHash}}'

Write the output as markdown in a similar style to the example content. Respond with the resulting file enclosed in <file></file> including the path to the file as an attribute

{{#if existingTranslation}}
The existing translation for this file is provided below enclosed in <existingTranslation></existingTranslation>. Use this as a reference and update it an necessary based on the provided source file.

<existingTranslation>
{{{existingTranslation.content}}}
</existingTranslation>
{{/if}}
`;

export function buildTranslatePrompt(
  tree: MarkdownTree,
  currentNode: TreeNode,
  sourceContent: LanguageContent,
  existingTranslation: LanguageContent | undefined,
  sourceLanguage: Language,
  targetLanguage: Language,
  contextStrategy: ContextStrategy,
  styleGuides: string[],
  exemplarNodes: TreeNode[],
): Prompt {
  const promptTemplate = Handlebars.compile(template);

  const contextNodes = getContext(tree, currentNode, contextStrategy);

  const context = buildContextPrompt(
    contextNodes,
    sourceLanguage,
    styleGuides,
    exemplarNodes,
  );

  return {
    context,
    prompt: promptTemplate({
      currentNode,
      targetLanguage,
      existingTranslation,
      sourceHash: sourceContent.hash,
    }),
    sampleOutput: sourceContent.content,
    prefill: `<file path="${currentNode.path}">`,
    transform: (input) => {
      const fileSection = extractFileSection(input);

      if (fileSection.path !== currentNode.path) {
        throw new Error(`Unexpected file path in output: ${fileSection.path}`);
      }

      return fileSection.content;
    },
  };
}
