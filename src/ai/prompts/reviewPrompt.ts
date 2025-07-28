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
import type { MarkdownTree, TreeNode } from "../../content/index.js";
import type { Language } from "../../languages/index.js";
import { buildContextPrompt } from "./contextPrompt.js";
import type { Prompt } from "./types.js";
import {
  type ContextStrategy,
  extractFileSection,
  getContext,
} from "./utils.js";

const template = `Your task is to:
- Review the content provided for file "{{file}}" and update it to improve it in terms of style, grammar and syntax
- Leave the overall structure of the page the same
- Make sure that explanations surrounding code snippets are accurate
- DO NOT alter text that appears to be logging
- DO NOT alter any content in markdown code fences indicated by \`\`\` or ':::code' such as bash commands or its associated output
- DO NOT alter the weight or sidebar_position values
- DO NOT alter the frontmatter or any other YAML content
- DO NOT remove Markdown formatting like bold or italics from text
- DO NOT remove any content in markdown inside the lines <!-- prettier-ignore-start --> and <!-- prettier-ignore-end -->
- DO NOT add a new line at the end of the file

Write the output as markdown in a similar style to the example content. Respond with the resulting file enclosed in <file></file> including the path to the file as an attribute`;

export function buildReviewPrompt(
  tree: MarkdownTree,
  currentNode: TreeNode,
  language: Language,
  contextStrategy: ContextStrategy,
  styleGuides: string[],
  exemplarNodes: TreeNode[],
): Prompt {
  const promptTemplate = Handlebars.compile(template);

  const contextNodes = getContext(tree, currentNode, contextStrategy);

  const context = buildContextPrompt(
    contextNodes,
    language,
    styleGuides,
    exemplarNodes,
  );

  return {
    context,
    prompt: promptTemplate({
      file: currentNode.path,
    }),
    sampleOutput: currentNode.languages.get(language.code)?.content,
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
