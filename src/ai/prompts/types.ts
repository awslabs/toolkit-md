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

import type { TreeNode } from "../../content/index.js";

/**
 * Represents a prompt configuration for AI model interactions.
 * This interface defines the structure of prompts sent to language models.
 */
export interface Prompt {
  /**
   * Optional additional context information provided to the model.
   * This is typically used to provide background information or specific instructions
   * that help the model generate more accurate responses.
   */
  context?: string;

  /**
   * The main prompt text sent to the model.
   * This is the primary instruction or question that the model will respond to.
   */
  prompt: string;

  /**
   * Optional text to pre-fill the model's response.
   * This can be used to guide the model's output format or to continue from a previous response.
   */
  prefill?: string;

  /**
   * Optional example of expected output.
   * This can be used for token estimation and to guide the model's response format.
   */
  sampleOutput?: string;

  /**
   * Optional function to transform the model's response.
   * This can be used to extract specific parts of the response or format it in a particular way.
   *
   * @param input - The raw response string from the model
   * @returns The transformed response string
   */
  transform?: (input: string) => string;
}

export interface Exemplar {
  path: string;

  nodes: TreeNode[];
}
