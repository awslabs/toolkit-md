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
import type { Language } from "../../languages/index.js";
import { buildExemplarPrompt } from "./exemplarPrompt.js";
import { buildStyleGuidePrompt } from "./styleGuidePrompt.js";
import type { Exemplar } from "./types.js";

const template = `These are best practices for writing Markdown content for this project:

{{{styleGuidePrompt}}}

{{{exemplarPrompt}}}
`;

export function buildBestPracticesPrompt(
  language: Language,
  styleGuides: string[],
  exemplarNodes: Exemplar[],
) {
  const promptTemplate = Handlebars.compile(template);

  const styleGuidePrompt = buildStyleGuidePrompt(styleGuides);

  const exemplarPrompt = buildExemplarPrompt(exemplarNodes);

  return promptTemplate({
    styleGuidePrompt,
    exemplarPrompt,
    language: language.name,
  }).trim();
}
