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

import { describe, expect, test, vi } from "vitest";
import { buildTranslatePrompt } from "../../../src/ai/prompts/translatePrompt";
import type {
  LanguageContent,
  MarkdownTree,
  TreeNode,
} from "../../../src/content/index.js";
import { TRANSLATION_SRC_HASH_KEY } from "../../../src/content/index.js";
import type { Language } from "../../../src/languages/index.js";

describe("buildTranslatePrompt", () => {
  const mockSourceLanguage: Language = {
    code: "en-US",
    name: "English (United States)",
  };

  const mockTargetLanguage: Language = {
    code: "fr-FR",
    name: "Français",
  };

  const createMockLanguageContent = (
    content: string,
    hash = "mock-hash",
  ): LanguageContent => ({
    content,
    frontmatter: {},
    path: "/mock/path.md",
    hash,
  });

  const createMockTreeNode = (
    path: string,
    content: string,
    languageCode = "en-US",
  ): TreeNode => ({
    name: "mock-node",
    path,
    isDirectory: false,
    weight: 0,
    languages: new Map([[languageCode, createMockLanguageContent(content)]]),
    children: [],
    parent: null,
  });

  const createMockMarkdownTree = (nodes: TreeNode[]): MarkdownTree =>
    ({
      getFlattenedTree: vi.fn().mockReturnValue(nodes),
      getSiblings: vi.fn().mockReturnValue(nodes.slice(1)),
    }) as unknown as MarkdownTree;

  test("should generate translate prompt with basic configuration", () => {
    const currentNode = createMockTreeNode(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );
    const sourceContent = createMockLanguageContent(
      "# Test Content\nThis is test content.",
      "source-hash-123",
    );
    const tree = createMockMarkdownTree([currentNode]);

    const result = buildTranslatePrompt(
      tree,
      currentNode,
      sourceContent,
      undefined,
      mockSourceLanguage,
      mockTargetLanguage,
      "nothing",
      [],
      [],
    );

    expect(result.prompt).toContain(
      'translate the content provided for file "/content/test.md" to Français (fr-FR)',
    );
    expect(result.prompt).toContain(
      `'${TRANSLATION_SRC_HASH_KEY}' with value 'source-hash-123'`,
    );
    expect(result.prompt).toContain(
      "DO NOT make any changes not related to translating",
    );
    expect(result.prompt).toContain("ALWAYS return the entire translated file");
    expect(result.prompt).not.toContain("existingTranslation");
    expect(result.sampleOutput).toBe("# Test Content\nThis is test content.");
    expect(result.prefill).toBe('<file path="/content/test.md">');
  });

  test("should include existing translation when provided", () => {
    const currentNode = createMockTreeNode(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );
    const sourceContent = createMockLanguageContent(
      "# Test Content\nThis is test content.",
      "source-hash-123",
    );
    const existingTranslation = createMockLanguageContent(
      "# Contenu de Test\nCeci est du contenu de test.",
    );
    const tree = createMockMarkdownTree([currentNode]);

    const result = buildTranslatePrompt(
      tree,
      currentNode,
      sourceContent,
      existingTranslation,
      mockSourceLanguage,
      mockTargetLanguage,
      "nothing",
      [],
      [],
    );

    expect(result.prompt).toContain("The existing translation for this file");
    expect(result.prompt).toContain("<existingTranslation>");
    expect(result.prompt).toContain(
      "# Contenu de Test\nCeci est du contenu de test.",
    );
    expect(result.prompt).toContain("</existingTranslation>");
    expect(result.prompt).toContain(
      "Use this as a reference and update it an necessary",
    );
  });

  test("should include context based on strategy", () => {
    const currentNode = createMockTreeNode(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );
    const sourceContent = createMockLanguageContent(
      "# Test Content\nThis is test content.",
    );
    const contextNode = createMockTreeNode(
      "/content/context.md",
      "# Context Content\nThis provides context.",
    );
    const tree = createMockMarkdownTree([currentNode, contextNode]);

    const result = buildTranslatePrompt(
      tree,
      currentNode,
      sourceContent,
      undefined,
      mockSourceLanguage,
      mockTargetLanguage,
      "everything",
      [],
      [],
    );

    expect(result.context).toContain("The content to review is written in");
    expect(result.context).toContain("English (United States)");
    expect(tree.getFlattenedTree).toHaveBeenCalled();
  });

  test("should handle different context strategies", () => {
    const currentNode = createMockTreeNode(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );
    const sourceContent = createMockLanguageContent(
      "# Test Content\nThis is test content.",
    );
    const tree = createMockMarkdownTree([currentNode]);

    // Test "nothing" strategy
    buildTranslatePrompt(
      tree,
      currentNode,
      sourceContent,
      undefined,
      mockSourceLanguage,
      mockTargetLanguage,
      "nothing",
      [],
      [],
    );

    // Test "siblings" strategy
    buildTranslatePrompt(
      tree,
      currentNode,
      sourceContent,
      undefined,
      mockSourceLanguage,
      mockTargetLanguage,
      "siblings",
      [],
      [],
    );

    expect(tree.getSiblings).toHaveBeenCalledWith(currentNode);
  });

  test("should include style guides in context", () => {
    const currentNode = createMockTreeNode(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );
    const sourceContent = createMockLanguageContent(
      "# Test Content\nThis is test content.",
    );
    const tree = createMockMarkdownTree([currentNode]);
    const styleGuides = [
      "Use formal language",
      "Maintain technical terminology",
    ];

    const result = buildTranslatePrompt(
      tree,
      currentNode,
      sourceContent,
      undefined,
      mockSourceLanguage,
      mockTargetLanguage,
      "nothing",
      styleGuides,
      [],
    );

    expect(result.context).toContain("style guidelines");
    expect(result.context).toContain("Use formal language");
    expect(result.context).toContain("Maintain technical terminology");
  });

  test("should include exemplar nodes in context", () => {
    const currentNode = createMockTreeNode(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );
    const sourceContent = createMockLanguageContent(
      "# Test Content\nThis is test content.",
    );
    const tree = createMockMarkdownTree([currentNode]);
    const exemplarNodes = [
      createMockTreeNode(
        "/examples/good.md",
        "# Good Example\nThis is a good example.",
      ),
    ];

    const result = buildTranslatePrompt(
      tree,
      currentNode,
      sourceContent,
      undefined,
      mockSourceLanguage,
      mockTargetLanguage,
      "nothing",
      [],
      exemplarNodes,
    );

    expect(result.context).toContain("example_files");
    expect(result.context).toContain("Good Example");
    expect(result.context).toContain("This is a good example.");
  });

  test("should handle transform function correctly", () => {
    const currentNode = createMockTreeNode(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );
    const sourceContent = createMockLanguageContent(
      "# Test Content\nThis is test content.",
    );
    const tree = createMockMarkdownTree([currentNode]);

    const result = buildTranslatePrompt(
      tree,
      currentNode,
      sourceContent,
      undefined,
      mockSourceLanguage,
      mockTargetLanguage,
      "nothing",
      [],
      [],
    );

    expect(result.transform).toBeDefined();

    // Test successful transformation
    const mockInput = `<file path="/content/test.md"># Contenu de Test
Ceci est du contenu de test.</file>`;

    // biome-ignore lint/style/noNonNullAssertion: Will be defined
    const transformedOutput = result.transform!(mockInput);
    expect(transformedOutput).toBe(`# Contenu de Test
Ceci est du contenu de test.`);
  });

  test("should throw error when transform receives wrong file path", () => {
    const currentNode = createMockTreeNode(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );
    const sourceContent = createMockLanguageContent(
      "# Test Content\nThis is test content.",
    );
    const tree = createMockMarkdownTree([currentNode]);

    const result = buildTranslatePrompt(
      tree,
      currentNode,
      sourceContent,
      undefined,
      mockSourceLanguage,
      mockTargetLanguage,
      "nothing",
      [],
      [],
    );

    const mockInputWithWrongPath = `<file path="/wrong/path.md">Content</file>`;

    // biome-ignore lint/style/noNonNullAssertion: Will be defined
    expect(() => result.transform!(mockInputWithWrongPath)).toThrow(
      "Unexpected file path in output: /wrong/path.md",
    );
  });

  test("should handle different language combinations", () => {
    const spanishLanguage: Language = {
      code: "es-US",
      name: "Español (Estados Unidos)",
    };

    const currentNode = createMockTreeNode(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );
    const sourceContent = createMockLanguageContent(
      "# Test Content\nThis is test content.",
    );
    const tree = createMockMarkdownTree([currentNode]);

    const result = buildTranslatePrompt(
      tree,
      currentNode,
      sourceContent,
      undefined,
      mockSourceLanguage,
      spanishLanguage,
      "nothing",
      [],
      [],
    );

    expect(result.prompt).toContain("to Español (Estados Unidos) (es-US)");
  });

  test("should preserve all translation constraints in prompt", () => {
    const currentNode = createMockTreeNode(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );
    const sourceContent = createMockLanguageContent(
      "# Test Content\nThis is test content.",
    );
    const tree = createMockMarkdownTree([currentNode]);

    const result = buildTranslatePrompt(
      tree,
      currentNode,
      sourceContent,
      undefined,
      mockSourceLanguage,
      mockTargetLanguage,
      "nothing",
      [],
      [],
    );
  });

  test("should handle complex content with special formatting", () => {
    const complexContent = `---
title: "Test Page"
weight: 10
---

# Test Content

This is a paragraph with \`inline code\`.

\`\`\`javascript
const example = "code block";
console.log(example);
\`\`\`

<!-- prettier-ignore-start -->
<div>Special HTML content</div>
<!-- prettier-ignore-end -->

:::code
bash command example
:::`;

    const currentNode = createMockTreeNode(
      "/content/complex.md",
      complexContent,
    );
    const sourceContent = createMockLanguageContent(
      complexContent,
      "complex-hash",
    );
    const tree = createMockMarkdownTree([currentNode]);

    const result = buildTranslatePrompt(
      tree,
      currentNode,
      sourceContent,
      undefined,
      mockSourceLanguage,
      mockTargetLanguage,
      "nothing",
      [],
      [],
    );

    expect(result.sampleOutput).toBe(complexContent);
    expect(result.prompt).toContain("complex-hash");
    expect(result.prefill).toBe('<file path="/content/complex.md">');
  });

  test("should handle empty style guides and exemplars", () => {
    const currentNode = createMockTreeNode(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );
    const sourceContent = createMockLanguageContent(
      "# Test Content\nThis is test content.",
    );
    const tree = createMockMarkdownTree([currentNode]);

    const result = buildTranslatePrompt(
      tree,
      currentNode,
      sourceContent,
      undefined,
      mockSourceLanguage,
      mockTargetLanguage,
      "nothing",
      [],
      [],
    );

    expect(result.context).not.toContain("style guidelines");
    expect(result.context).not.toContain("example_files");
  });
});
