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
import type { ContentNode } from "../../content/index.js";
import type { Language } from "../../languages/index.js";
import { buildContextPrompt } from "./contextPrompt.js";
import type { Exemplar, Prompt } from "./types.js";

const template = `Your task is the answer the following query related to the specified content:

{{{question}}}`;

export function buildAskPrompt(
  question: string,
  nodes: ContentNode[],
  language: Language,
  styleGuides: string[],
  exemplars: Exemplar[],
): Prompt {
  const promptTemplate = Handlebars.compile(template);

  const context = buildContextPrompt(nodes, language, styleGuides, exemplars);

  return {
    context,
    prompt: promptTemplate({
      question,
    }),
  };
}
