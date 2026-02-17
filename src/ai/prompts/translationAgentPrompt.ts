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
import type { ContentTree } from "../../content/index.js";
import type { Language } from "../../languages/index.js";
import { buildContentMapPrompt } from "./contentMapPrompt.js";
import { buildStyleGuidePrompt } from "./styleGuidePrompt.js";
import type { Prompt } from "./types.js";

const template = `The following are instructions to translate Markdown content from "{{sourceLanguage.name}}" to "{{targetLanguage.name}}".

1. Break the overall translation task down in to sub-tasks, for example translating a directory at a time.
2. Only translate the files that map to the requested content. This could be the entire set of content or a sub-set.
3. Read the Markdown files for the requested content to be translated in the source language.
4. Check for an existing translation in the requested language. If it exists, use it as a starting point for the translation.
5. Translate the source content to the requested language.
6. Write the translated content for each file in the requested language in the same format as the source language.

ONLY make changes to the content related to translation.

The file naming for the translated content is of the following format:

<file name>.<language short code>.md

For example a file "test.{{sourceLanguage.code}}.md" or "test.md" translated to {{targetLanguage.name}} would be written to "test.{{targetLanguage.code}}.md".

{{#if includeSourceContentMap}}
## Source language content map

{{#if sourceContentMap.length}}
{{{sourceContentMap}}}
{{else}}
No source Markdown content was found based on the provided criteria.
{{/if}}
{{/if}}

## Target language content map

{{#if targetContentMap.length}}
{{{targetContentMap}}}
{{else}}
No existing translated Markdown content was found based on the provided criteria.
{{/if}}

## Style best practices

{{{styleGuidePrompt}}}
`;

export function buildTranslationAgentPrompt(
  sourceTree: ContentTree,
  targetTree: ContentTree,
  sourceLanguage: Language,
  targetLanguage: Language,
  includeSourceContentMap: boolean,
  sourceContentDirectory: string,
  targetContentDirectory: string,
  styleGuides: string[],
): Prompt {
  const promptTemplate = Handlebars.compile(template);

  const sourceContentMap = buildContentMapPrompt(
    sourceTree,
    sourceContentDirectory,
    sourceLanguage,
    false,
  );
  const targetContentMap = buildContentMapPrompt(
    targetTree,
    targetContentDirectory,
    targetLanguage,
    false,
  );

  const styleGuidePrompt = buildStyleGuidePrompt(styleGuides);

  return {
    prompt: promptTemplate({
      includeSourceContentMap,
      sourceContentMap,
      targetContentMap,
      sourceLanguage,
      targetLanguage,
      styleGuidePrompt,
    }),
  };
}
