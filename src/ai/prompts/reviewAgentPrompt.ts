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

const template = `The following are instructions to review Markdown content as requested".

1. Break the overall review task down in to sub-tasks, for example reviewing a directory at a time.
2. Only review the files that map to the requested content. This could be the entire set of content or a sub-set.
3. Read the Markdown files for the requested content to be reviewed in the source language.
5. Review the content for issues as outlined below.
6. Update the original files with the suggest changes.

Your task is to review the requested files to improve them in terms of:
- Spelling, grammar, syntax and other language issues or errors
- Clarity and conciseness
- Accurancy and thoroughness of explanations or context
- Consistency with any style guides or exemplar content that has been provided

If no improvements are identified for a given file then do not update it.

{{#if instructions}}
In additional you've been provided the following additional instructions:
{{{instructions}}}
{{/if}}

{{#if includeContentMap}}
## Content map

{{#if contentMap.length}}
{{{contentMap}}}
{{else}}
No Markdown content was found based on the provided criteria.
{{/if}}
{{/if}}

{{#if styleGuidePrompt.length}}
## Style best practices

{{{styleGuidePrompt}}}
{{/if}}
`;

export function buildReviewAgentPrompt(
  tree: ContentTree,
  language: Language,
  contentDirectory: string,
  includeContentMap: boolean,
  styleGuides: string[],
): Prompt {
  const promptTemplate = Handlebars.compile(template);

  const contentMap = buildContentMapPrompt(
    tree,
    contentDirectory,
    language,
    false,
  );

  const styleGuidePrompt = buildStyleGuidePrompt(styleGuides);

  return {
    prompt: promptTemplate({
      includeContentMap,
      contentMap,
      styleGuidePrompt,
    }),
  };
}
