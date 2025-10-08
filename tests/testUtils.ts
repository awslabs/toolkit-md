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

import {
  type ContentNode,
  ContentTree,
  MockProvider,
} from "../src/content/index.js";

/**
 * Creates a mock TreeNode for testing purposes.
 *
 * This utility function creates a mock TreeNode with sensible defaults
 * that can be used across different test files. It provides a consistent
 * way to create test data without duplicating the same mock creation logic.
 *
 * @param path - The path for the mock node
 * @param content - The content for the mock node
 * @param hash - Optional hash for the mock node (defaults to "mock-hash")
 * @returns A mock TreeNode with the specified properties
 *
 * @example
 * ```typescript
 * const node = createMockTreeNode("/content/test.md", "# Test\nContent here");
 * const nodeWithHash = createMockTreeNode("/content/test.md", "# Test", "custom-hash");
 * ```
 */
export function createMockTreeNode(
  path: string,
  content: string,
  hash: string = "mock-hash",
): ContentNode {
  return {
    name: "mock-node",
    path,
    isDirectory: false,
    language: "en",
    weight: 0,
    children: [],
    parent: null,
    content,
    frontmatter: {},
    filePath: path,
    hash,
  };
}

/**
 * Creates a mock TreeNode with empty/null content for testing edge cases.
 *
 * This utility function creates a mock TreeNode that represents a node
 * without content, which is useful for testing filtering logic and
 * edge cases in content processing.
 *
 * @param path - The path for the mock node
 * @returns A mock TreeNode with null content and related properties
 *
 * @example
 * ```typescript
 * const emptyNode = createMockEmptyTreeNode("/content/empty.md");
 * ```
 */
export function createMockEmptyTreeNode(path: string): ContentNode {
  return {
    name: "empty-node",
    path,
    isDirectory: false,
    weight: 0,
    children: [],
    parent: null,
    content: null,
    language: "en",
    frontmatter: {},
    filePath: "",
    hash: null,
  };
}

/**
 * Convenience function to create a mock tree for testing.
 *
 * Creates a ContentTree with a MockProvider and optionally loads initial content.
 * Perfect for testing scenarios where you don't want filesystem dependencies.
 *
 * @param defaultLanguage - Default language code for files without language suffix
 * @param initialContent - Optional array of initial content entries
 * @returns ContentTree with MockProvider
 *
 * @example
 * ```typescript
 * const tree = createMockTree('en', [
 *   { path: '/docs/guide.md', content: '# Guide' },
 *   { path: '/docs/tutorial.md', content: '# Tutorial' }
 * ]);
 *
 * const allContent = tree.getContent();
 * console.log(`Mock tree has ${allContent.length} files`);
 * ```
 */
export function createMockTree(
  defaultLanguage: string = "en",
  initialContent: Array<{ path: string; content: string }> = [],
): ContentTree {
  // Use the exported classes directly since they're already imported above
  const provider = new MockProvider(initialContent);
  const tree = new ContentTree(provider, { defaultLanguage });

  initialContent.forEach(({ path, content }) => {
    tree.add(path, content);
  });

  return tree;
}
