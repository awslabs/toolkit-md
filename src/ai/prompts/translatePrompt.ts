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

export const TRANSLATE_WRITE_TOOL_NAME = "write_file";

const template = `Your task is to translate the content provided for file "{{currentNode.filePath}}" to {{targetLanguage.name}} ({{targetLanguage.code}}).

DO NOT make any changes not related to translating the content
{{#unless editMode}}
ALWAYS return the entire translated file, do not abbreviate it
{{/unless}}
DO NOT add, modify or remove the Markdown frontmatter keys '${TRANSLATION_SRC_HASH_KEY}' or '${LEGACY_TRANSLATION_SRC_HASH_KEY}' - these are managed automatically
ALWAYS avoid translating code snippets, terminal commands and sample log output
YOU MUST translate code and terminal comments included in code snippets

Example of translating terminal comments. This English content:

\`\`\`bash test=false
$ POD_HOSTIP_1=$(kubectl get po --selector app.kubernetes.io/component=service -n orders -o json | jq -r '.items[0].spec.nodeName')
$ kubectl debug node/$POD_HOSTIP_1 -it --image=ubuntu
# Run these commands inside the pod
$ grep DENY /host/var/log/aws-routed-eni/network-policy-agent.log | tail -5
\'\'\'

Would become this Japanese content:

\`\`\`bash test=false
$ POD_HOSTIP_1=$(kubectl get po --selector app.kubernetes.io/component=service -n orders -o json | jq -r '.items[0].spec.nodeName')
$ kubectl debug node/$POD_HOSTIP_1 -it --image=ubuntu
# ポッド内でこれらのコマンドを実行
$ grep DENY /host/var/log/aws-routed-eni/network-policy-agent.log | tail -5
\'\'\'

{{#if editMode}}
The existing translation for this file is provided below enclosed in <existingTranslation></existingTranslation>. It was translated from an earlier version of the source file. Update it to match the current source by applying targeted edits with the "edit_file" tool - each edit's oldText must match the existing translation exactly and appear only once. Use "write_file" only if the source has changed so extensively that most of the translation must be redone. When the translation is fully up to date call "finish_translation" with a one sentence summary.

<existingTranslation>
{{{existingTranslation.content}}}
</existingTranslation>
{{else}}
Write the output as markdown in a similar style to the example content. Provide the complete translated file by calling the "${TRANSLATE_WRITE_TOOL_NAME}" tool with the file path and the full translated content.

{{#if existingTranslation}}
The existing translation for this file is provided below enclosed in <existingTranslation></existingTranslation>. Use this as a reference and update it an necessary based on the provided source file.

<existingTranslation>
{{{existingTranslation.content}}}
</existingTranslation>
{{/if}}
{{/if}}
`;

export interface TranslatePromptOptions {
  /** Existing translation to update, if one exists */
  existingTranslation?: ContentNode;

  /** Language of the source content */
  sourceLanguage: Language;

  /** Language to translate into */
  targetLanguage: Language;

  /** Strategy for including sibling content in the prompt context */
  contextStrategy: ContextStrategy;

  /** Style guide contents to include in the prompt context */
  styleGuides: string[];

  /** Exemplar content to include in the prompt context */
  exemplars: Exemplar[];

  /**
   * Instruct the model to update the existing translation with targeted
   * edits instead of rewriting it. Only meaningful when an existing
   * translation is provided.
   */
  editMode?: boolean;
}

/**
 * Builds the translation prompt for a content node.
 *
 * The prompt instructs the model to return the translated file through the
 * write_file tool rather than as free text.
 *
 * @param tree - Content tree providing prompt context
 * @param currentNode - Node being translated
 * @param options - Prompt content options
 * @returns The prompt
 */
export function buildTranslatePrompt(
  tree: ContentTree,
  currentNode: ContentNode,
  options: TranslatePromptOptions,
): Prompt {
  const {
    existingTranslation,
    sourceLanguage,
    targetLanguage,
    contextStrategy,
    styleGuides,
    exemplars,
    editMode = false,
  } = options;

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
      editMode: editMode && Boolean(existingTranslation),
    }),
    sampleOutput: currentNode.content || "",
  };
}
