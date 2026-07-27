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
import {
  buildTranslatePrompt,
  TRANSLATE_WRITE_TOOL_NAME,
  type TranslatePromptOptions,
} from "../../../src/ai/prompts/translatePrompt";
import { TRANSLATION_SRC_HASH_KEY } from "../../../src/content/index.js";
import type { Language } from "../../../src/languages/index.js";
import { createMockTree, createMockTreeNode } from "../../testUtils.js";

describe("buildTranslatePrompt", () => {
  const mockSourceLanguage: Language = {
    code: "en-US",
    name: "English (United States)",
  };

  const mockTargetLanguage: Language = {
    code: "fr-FR",
    name: "Français",
  };

  function promptOptions(
    overrides: Partial<TranslatePromptOptions> = {},
  ): TranslatePromptOptions {
    return {
      sourceLanguage: mockSourceLanguage,
      targetLanguage: mockTargetLanguage,
      contextStrategy: "nothing",
      styleGuides: [],
      exemplars: [],
      ...overrides,
    };
  }

  test("should generate translate prompt with basic configuration", () => {
    const tree = createMockTree("en");
    const currentNode = tree.forceAdd(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );

    const result = buildTranslatePrompt(tree, currentNode, promptOptions());

    expect(result.prompt).toContain(
      'translate the content provided for file "/content/test.md" to Français (fr-FR)',
    );
    expect(result.prompt).toContain(
      `DO NOT add, modify or remove the Markdown frontmatter keys '${TRANSLATION_SRC_HASH_KEY}'`,
    );
    expect(result.prompt).toContain(
      "DO NOT make any changes not related to translating",
    );
    expect(result.prompt).toContain("ALWAYS return the entire translated file");
    expect(result.prompt).not.toContain("existingTranslation");
    expect(result.sampleOutput).toBe("# Test Content\nThis is test content.");
  });

  test("should include existing translation when provided", () => {
    const existingTranslation = createMockTreeNode(
      "/content/test.fr.md",
      "# Contenu de Test\nCeci est du contenu de test.",
    );
    const tree = createMockTree("en");
    const currentNode = tree.forceAdd(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );

    const result = buildTranslatePrompt(
      tree,
      currentNode,
      promptOptions({ existingTranslation }),
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
    const tree = createMockTree("en");
    const currentNode = tree.forceAdd(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );
    tree.forceAdd(
      "/content/context.md",
      "# Context Content\nThis provides context.",
    );

    const result = buildTranslatePrompt(
      tree,
      currentNode,
      promptOptions({ contextStrategy: "everything" }),
    );

    expect(result.context).toContain(
      "The content is written in English (United States) provided in Markdown format below",
    );
  });

  test("should handle different context strategies", () => {
    const tree = createMockTree("en");
    const currentNode = tree.forceAdd(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );

    buildTranslatePrompt(
      tree,
      currentNode,
      promptOptions({ contextStrategy: "nothing" }),
    );

    buildTranslatePrompt(
      tree,
      currentNode,
      promptOptions({ contextStrategy: "siblings" }),
    );
  });

  test("should include style guides in context", () => {
    const tree = createMockTree("en");
    const currentNode = tree.forceAdd(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );
    const styleGuides = [
      "Use formal language",
      "Maintain technical terminology",
    ];

    const result = buildTranslatePrompt(
      tree,
      currentNode,
      promptOptions({ styleGuides }),
    );

    expect(result.context).toContain("style guidelines");
    expect(result.context).toContain("Use formal language");
    expect(result.context).toContain("Maintain technical terminology");
  });

  test("should include exemplar nodes in context", () => {
    const tree = createMockTree("en");
    const currentNode = tree.forceAdd(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );
    const exemplarNodes = [
      createMockTreeNode(
        "/examples/good.md",
        "# Good Example\nThis is a good example.",
      ),
    ];
    const exemplars: Exemplar[] = [
      {
        path: "/examples",
        nodes: exemplarNodes,
      },
    ];

    const result = buildTranslatePrompt(
      tree,
      currentNode,
      promptOptions({ exemplars }),
    );

    expect(result.context).toContain('<example path="/examples">');
    expect(result.context).toContain("Good Example");
    expect(result.context).toContain("This is a good example.");
  });

  test("should instruct the model to use the write_file tool", () => {
    const tree = createMockTree("en");
    const currentNode = tree.forceAdd(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );

    const result = buildTranslatePrompt(tree, currentNode, promptOptions());

    expect(result.transform).toBeUndefined();
    expect(result.prompt).toContain(
      `calling the "${TRANSLATE_WRITE_TOOL_NAME}" tool`,
    );
  });

  test("should instruct targeted edits in edit mode with an existing translation", () => {
    const existingTranslation = createMockTreeNode(
      "/content/test.fr.md",
      "# Contenu de Test",
    );
    const tree = createMockTree("en");
    const currentNode = tree.forceAdd(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );

    const result = buildTranslatePrompt(
      tree,
      currentNode,
      promptOptions({ existingTranslation, editMode: true }),
    );

    expect(result.prompt).toContain('"edit_file"');
    expect(result.prompt).toContain('"finish_translation"');
    expect(result.prompt).not.toContain(
      "ALWAYS return the entire translated file",
    );
    expect(result.prompt).toContain("<existingTranslation>");
  });

  test("should ignore edit mode when there is no existing translation", () => {
    const tree = createMockTree("en");
    const currentNode = tree.forceAdd(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );

    const result = buildTranslatePrompt(
      tree,
      currentNode,
      promptOptions({ editMode: true }),
    );

    expect(result.prompt).not.toContain('"edit_file"');
    expect(result.prompt).toContain(
      `calling the "${TRANSLATE_WRITE_TOOL_NAME}" tool`,
    );
  });

  test("should handle different language combinations", () => {
    const spanishLanguage: Language = {
      code: "es-US",
      name: "Español (Estados Unidos)",
    };

    const tree = createMockTree("en");
    const currentNode = tree.forceAdd(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );

    const result = buildTranslatePrompt(
      tree,
      currentNode,
      promptOptions({ targetLanguage: spanishLanguage }),
    );

    expect(result.prompt).toContain("to Español (Estados Unidos) (es-US)");
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

    const tree = createMockTree("en");
    const currentNode = tree.forceAdd("/content/complex.md", complexContent);

    const result = buildTranslatePrompt(tree, currentNode, promptOptions());

    expect(result.sampleOutput).toBe(complexContent);
  });

  test("should handle empty style guides and exemplars", () => {
    const tree = createMockTree("en");
    const currentNode = tree.forceAdd(
      "/content/test.md",
      "# Test Content\nThis is test content.",
    );

    const result = buildTranslatePrompt(tree, currentNode, promptOptions());

    expect(result.context).not.toContain("style guidelines");
    expect(result.context).not.toContain("example_files");
  });
});
