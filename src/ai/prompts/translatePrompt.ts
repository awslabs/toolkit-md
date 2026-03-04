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
  type ContentNode,
  type ContentTree,
  LEGACY_TRANSLATION_SRC_HASH_KEY,
  TRANSLATION_SRC_HASH_KEY,
} from "../../content/index.js";
import type { Language } from "../../languages/index.js";
import { buildContextPrompt } from "./contextPrompt.js";
import type { Exemplar, Prompt } from "./types.js";
import { type ContextStrategy, getContext } from "./utils.js";

const template = `Your task is to translate the content provided for file "{{currentNode.filePath}}" to {{targetLanguage.name}} ({{targetLanguage.code}}).

DO NOT make any changes not related to translating the content
ALWAYS return the entire translated file, do not abbreviate it
ALWAYS add or update the Markdown frontmatter with a key '${TRANSLATION_SRC_HASH_KEY}' with value '{{sourceHash}}'
ALWAYS remove the Markdown frontmatter with key '${LEGACY_TRANSLATION_SRC_HASH_KEY}' as this is deprecated

Write the translated content in a similar style to the example content. Use the write_file tool to output the result to "{{currentNode.filePath}}" in chunks:
- Each chunk is a separate call to write_file
- You MUST NOT write more than ~3000 tokens per chunk (roughly 2000-2500 words)
- Break at natural boundaries: section headers, major paragraphs
- First call: mode="create"
- Subsequent calls: mode="append"
- Continue until complete

Write substantial chunks to minimize tool calls while staying well under the output limit.

You're final response to the user MUST simply be "Success".

{{#if existingTranslation}}
The existing translation for this file is provided below enclosed in <existingTranslation></existingTranslation>. Use this as a reference and update it an necessary based on the provided source file.

<existingTranslation>
{{{existingTranslation.content}}}
</existingTranslation>
{{/if}}
`;

export function buildTranslatePrompt(
  tree: ContentTree,
  currentNode: ContentNode,
  existingTranslation: ContentNode | undefined,
  sourceLanguage: Language,
  targetLanguage: Language,
  contextStrategy: ContextStrategy,
  styleGuides: string[],
  exemplars: Exemplar[],
): Prompt {
  const promptTemplate = Handlebars.compile(template);

  const contextNodes = getContext(tree, currentNode, contextStrategy);

  const context = buildContextPrompt(
    contextNodes,
    sourceLanguage,
    styleGuides,
    exemplars,
  );

  return {
    context,
    prompt: promptTemplate({
      currentNode,
      targetLanguage,
      existingTranslation,
      sourceHash: currentNode.hash,
    }),
    sampleOutput: currentNode.content || "",
  };
}
