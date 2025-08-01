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

import { XMLParser } from "fast-xml-parser";
import type { MarkdownTree, TreeNode } from "../../content/index.js";

export type ContextStrategy = "everything" | "nothing" | "siblings";

export function getContext(
  tree: MarkdownTree,
  currentNode: TreeNode,
  strategy: ContextStrategy,
): TreeNode[] {
  switch (strategy) {
    case "everything":
      return tree.getFlattenedTree();
    case "nothing":
      return [currentNode];
    case "siblings":
      return tree.getSiblings(currentNode);
  }
}

/**
 * Appends a string to a prompt if the string is defined
 * @param prompt - The original prompt string
 * @param toAppend - The string to append
 * @returns The combined prompt string
 */
export function append(prompt: string, toAppend: string | undefined) {
  if (toAppend) {
    prompt += `${toAppend}\n\n`;
  }

  return prompt;
}

/**
 * Substitutes placeholders in a template with values from a variables map
 * @param template - The template string containing placeholders in the format "{{variable}}"
 * @param variables - A map of variable names to their replacement values
 * @returns The template with all placeholders replaced with their corresponding values
 */
export function substituteVariables(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, variableName) => {
    return variables[variableName] !== undefined
      ? variables[variableName]
      : match;
  });
}

interface FileSection {
  path: string;
  content: string;
}

export function extractFileSection(input: string): FileSection {
  const parser = new XMLParser({
    ignoreAttributes: false,
    stopNodes: ["file"],
  });
  const parsed = parser.parse(input);

  if (parsed.file) {
    const text: string = parsed.file["#text"];
    const path = parsed.file["@_path"];

    if (text && path) {
      return {
        path,
        content: text.trimStart(),
      };
    }
  }

  throw new Error("Failed to parse file response");
}
