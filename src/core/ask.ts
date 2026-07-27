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

/**
 * @fileoverview Question answering service.
 *
 * Transport-agnostic implementation of the ask operation: sends the
 * content tree and a question to the model and returns the answer.
 */

import type { BedrockClient, Exemplar, TokenUsage } from "../ai/index.js";
import { buildAskPrompt } from "../ai/prompts/index.js";
import type { ContentTree } from "../content/index.js";
import type { Language } from "../languages/index.js";

export interface AskServiceOptions {
  /** Tree containing the content to query */
  tree: ContentTree;

  /** Model client used to answer the question */
  client: BedrockClient;

  /** Question to ask about the content */
  question: string;

  /** Language of the content */
  language: Language;

  /** Style guide contents to include in the prompt */
  styleGuides: string[];

  /** Exemplar content to include in the prompt */
  exemplars: Exemplar[];
}

export interface AskResult {
  /** The model's answer */
  answer: string;

  /** Token usage for the request */
  usage: TokenUsage;
}

/**
 * Answers a question about the content tree using the model.
 *
 * @param options - Question, content, and prompt inputs
 * @returns The answer and token usage
 */
export async function askContent(
  options: AskServiceOptions,
): Promise<AskResult> {
  const { tree, client, question, language, styleGuides, exemplars } = options;

  const prompt = buildAskPrompt(
    question,
    tree.getFlattenedTree(),
    language,
    styleGuides,
    exemplars,
  );

  const response = await client.generate(prompt, false);

  return {
    answer: response.output,
    usage: response.usage,
  };
}
