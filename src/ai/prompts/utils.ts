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

import type { ContentNode, ContentTree } from "../../content/index.js";

export type ContextStrategy = "everything" | "nothing" | "siblings";

export function getContext(
  tree: ContentTree,
  currentNode: ContentNode,
  strategy: ContextStrategy,
): ContentNode[] {
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

/**
 * Parses a file section from XML-like string format using regex.
 *
 * Extracts the path attribute and content from a string in the format:
 * `<file path="example.txt">file content here</file>`
 *
 * @param input - The input string containing the file tag
 * @returns Object with path and content properties
 * @throws Error if the input format is invalid or required parts are missing
 *
 * @example
 * ```typescript
 * const result = extractFileSection('<file path="test.txt">Hello World</file>');
 * // Returns: { path: "test.txt", content: "Hello World" }
 * ```
 */
export function extractFileSection(input: string): FileSection {
  // Regex to match <file path="...">content</file> format
  const fileTagRegex = /<file\s+path="([^"]*)"\s*>([\s\S]*?)<\/file>/;
  const match = input.match(fileTagRegex);

  if (!match) {
    throw new Error(
      'Invalid file format: Expected <file path="...">content</file>',
    );
  }

  const [, path, content] = match;

  if (!path || path.trim() === "") {
    throw new Error("Missing or empty path attribute in file tag");
  }

  return {
    path: path.trim(),
    content: content.trimStart(),
  };
}

export interface File {
  path: string;
  content: string;
}

export function buildFileList(nodes: ContentNode[]): File[] {
  return nodes
    .filter((e) => e.content !== null)
    .map((e) => {
      return {
        path: e.path,
        // biome-ignore lint/style/noNonNullAssertion: Filtered above
        content: e.content!,
      };
    });
}
