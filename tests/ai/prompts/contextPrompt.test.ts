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

import { describe, expect, test } from "vitest";
import type { Exemplar } from "../../../src/ai/index.js";
import { buildContextPrompt } from "../../../src/ai/prompts/contextPrompt";
import type { Language } from "../../../src/languages/index.js";
import {
  createMockEmptyTreeNode,
  createMockTreeNode,
} from "../../testUtils.js";

describe("buildContextPrompt", () => {
  const mockLanguage: Language = {
    code: "en-US",
    name: "English (United States)",
  };

  test("should generate prompt with context files only", () => {
    const contextNodes = [
      createMockTreeNode("/path/to/file1.md", "# File 1\nContent of file 1"),
      createMockTreeNode("/path/to/file2.md", "# File 2\nContent of file 2"),
    ];

    const result = buildContextPrompt(contextNodes, mockLanguage, [], []);

    expect(result).toContain(
      "The content is written in English (United States) provided in Markdown format below",
    );
    expect(result).toContain('<file path="/path/to/file1.md">');
    expect(result).toContain("# File 1\nContent of file 1");
    expect(result).toContain('<file path="/path/to/file2.md">');
    expect(result).toContain("# File 2\nContent of file 2");
    expect(result).toContain(
      "The order of the files in the list should be used",
    );
    expect(result).not.toContain("style guidelines");
    expect(result).not.toContain("example_files");
  });

  test("should generate prompt with style guides", () => {
    const contextNodes = [
      createMockTreeNode("/path/to/file.md", "# Test File\nTest content"),
    ];
    const styleGuides = [
      "Use clear and concise language",
      "Follow markdown best practices",
    ];

    const result = buildContextPrompt(
      contextNodes,
      mockLanguage,
      styleGuides,
      [],
    );

    expect(result).toContain("The follow are style guidelines");
    expect(result).toContain(
      "<style>\nUse clear and concise language\n</style>",
    );
    expect(result).toContain(
      "<style>\nFollow markdown best practices\n</style>",
    );
  });

  test("should generate prompt with exemplar files", () => {
    const contextNodes = [
      createMockTreeNode("/path/to/file.md", "# Test File\nTest content"),
    ];
    const exemplarNodes = [
      createMockTreeNode(
        "/examples/good1.md",
        "# Good Example 1\nExemplary content 1",
      ),
      createMockTreeNode(
        "/examples/good2.md",
        "# Good Example 2\nExemplary content 2",
      ),
    ];
    const exemplars: Exemplar[] = [
      {
        path: "/examples",
        nodes: exemplarNodes,
      },
    ];

    const result = buildContextPrompt(
      contextNodes,
      mockLanguage,
      [],
      exemplars,
    );

    expect(result).toContain('<example_file path="/examples/good1.md">');
    expect(result).toContain("# Good Example 1\nExemplary content 1");
    expect(result).toContain('<example_file path="/examples/good2.md">');
    expect(result).toContain("# Good Example 2\nExemplary content 2");
    expect(result).toContain(
      "The following content has been provided as a reference",
    );
  });

  test("should generate complete prompt with all components", () => {
    const contextNodes = [
      createMockTreeNode(
        "/content/main.md",
        "# Main Content\nMain file content",
      ),
    ];
    const styleGuides = ["Be concise and clear"];
    const exemplarNodes = [
      createMockTreeNode(
        "/examples/reference.md",
        "# Reference\nReference content",
      ),
    ];
    const exemplars: Exemplar[] = [
      {
        path: "/examples",
        nodes: exemplarNodes,
      },
    ];

    const result = buildContextPrompt(
      contextNodes,
      mockLanguage,
      styleGuides,
      exemplars,
    );

    // Check all sections are present
    expect(result).toContain("style guidelines");
    expect(result).toContain("<style>\nBe concise and clear\n</style>");
    expect(result).toContain("written in English (United States)");
    expect(result).toContain('<file path="/content/main.md">');
    expect(result).toContain("# Main Content\nMain file content");
    expect(result).toContain('<example path="/examples">');
    expect(result).toContain('<example_file path="/examples/reference.md">');
    expect(result).toContain("# Reference\nReference content");
  });

  test("should handle nodes with content", () => {
    const contextNodes = [
      createMockTreeNode("/file1.md", "English content"),
      // Create a node without content to test filtering
      createMockEmptyTreeNode("/file2.md"),
    ];

    const result = buildContextPrompt(contextNodes, mockLanguage, [], []);

    expect(result).toContain("English content");
    expect(result).toContain('<file path="/file1.md">');
    expect(result).not.toContain('<file path="/file2.md">');
  });

  test("should handle exemplar nodes with content", () => {
    const contextNodes = [createMockTreeNode("/content.md", "Main content")];
    const exemplarNodes = [
      createMockTreeNode("/examples/example1.md", "English example"),
      // Create a node without content to test filtering
      createMockEmptyTreeNode("/examples/example2.md"),
    ];
    const exemplars: Exemplar[] = [
      {
        path: "/examples",
        nodes: exemplarNodes,
      },
    ];

    const result = buildContextPrompt(
      contextNodes,
      mockLanguage,
      [],
      exemplars,
    );

    expect(result).toContain("English example");
    expect(result).toContain('<example_file path="/examples/example1.md">');
    expect(result).not.toContain('<example_file path="/examples/example2.md">');
  });

  test("should handle empty context nodes", () => {
    const result = buildContextPrompt([], mockLanguage, [], []);

    expect(result).toContain("written in English (United States)");
    expect(result).toContain("<content_files></content_files>");
  });

  test("should handle empty style guides", () => {
    const contextNodes = [createMockTreeNode("/file.md", "Test content")];

    const result = buildContextPrompt(contextNodes, mockLanguage, [], []);

    expect(result).not.toContain("style guidelines");
    expect(result).not.toContain("<style>");
  });

  test("should handle empty exemplar nodes", () => {
    const contextNodes = [createMockTreeNode("/file.md", "Test content")];

    const result = buildContextPrompt(contextNodes, mockLanguage, [], []);

    expect(result).not.toContain("example_files");
    expect(result).not.toContain("<example");
  });

  test("should preserve content formatting and special characters", () => {
    const contextNodes = [
      createMockTreeNode(
        "/file.md",
        "# Title\n\n```javascript\nconst x = 'test';\n```\n\n<div>HTML content</div>",
      ),
    ];

    const result = buildContextPrompt(contextNodes, mockLanguage, [], []);

    expect(result).toContain(
      "# Title\n\n```javascript\nconst x = 'test';\n```\n\n<div>HTML content</div>",
    );
  });

  test("should handle multiple nodes with same language", () => {
    const contextNodes = [
      createMockTreeNode("/file1.md", "Content 1"),
      createMockTreeNode("/file2.md", "Content 2"),
      createMockTreeNode("/file3.md", "Content 3"),
    ];

    const result = buildContextPrompt(contextNodes, mockLanguage, [], []);

    expect(result).toContain("Content 1");
    expect(result).toContain("Content 2");
    expect(result).toContain("Content 3");
    expect(result).toContain('<file path="/file1.md">');
    expect(result).toContain('<file path="/file2.md">');
    expect(result).toContain('<file path="/file3.md">');
  });

  test("should use correct language name in prompt", () => {
    const frenchLanguage: Language = {
      code: "fr-FR",
      name: "Français",
    };
    const contextNodes = [createMockTreeNode("/file.md", "Contenu français")];

    const result = buildContextPrompt(contextNodes, frenchLanguage, [], []);

    expect(result).toContain("written in Français");
  });
});
