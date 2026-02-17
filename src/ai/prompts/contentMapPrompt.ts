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

const template = `This is a map of Markdown content in this project in {{language.name}}. All files are relative to the following directory:

{{{rootDir}}}

Content map is as follows:

{{#if contentMap.length}}
{{{contentMap}}}
{{else}}
No content was found
{{/if}}
`;

export function buildContentMapPrompt(
  tree: ContentTree,
  contentDir: string,
  language: Language,
  includeImages: boolean,
) {
  const promptTemplate = Handlebars.compile(template);

  return promptTemplate({
    rootDir: contentDir,
    contentMap: tree.getTreeMap(includeImages),
    language,
  }).trim();
}
