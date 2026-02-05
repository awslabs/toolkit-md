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

const template = `The following is a summary of the Markdown content in the project in directory "{{projectDirectory}}".

{{#if contentDirectory}}
Markdown content in this project is located in the content directory "{{contentDirectory}}".
{{else}}
The project directory is considered the content directory for this project.
{{/if}}

The default language is {{language.name}} ({{language.code}}) and if no language is explicity specified this will be used for all other operations.

When discovering Markdown files in the repository if no language is found in the file name then it will be assumed to be {{language.name}} ({{language.code}}).

For example, a file "test.md" is assumed to be {{defaultLanguage.name}} even if its not named "test.{{defaultLanguage.code}}.md".

## Content map

{{{contentMap}}}
`;

export function buildContentSummaryPrompt(
  tree: ContentTree,
  projectDirectory: string,
  contentDirectory: string | undefined,
  language: Language,
  defaultLanguage: Language,
  sourceLanguage: Language,
): string {
  const promptTemplate = Handlebars.compile(template);

  const contentMap = buildContentMapPrompt(
    tree,
    contentDirectory || projectDirectory,
    sourceLanguage,
  );

  return promptTemplate({
    language,
    projectDirectory,
    contentDirectory,
    defaultLanguage,
    sourceLanguage,
    contentMap,
  });
}
