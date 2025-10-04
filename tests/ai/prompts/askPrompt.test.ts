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
import { buildAskPrompt } from "../../../src/ai/prompts/askPrompt";
import type { LanguageContent, TreeNode } from "../../../src/content/index.js";
import type { Language } from "../../../src/languages/index.js";

describe("buildAskPrompt", () => {
  const mockLanguage: Language = {
    code: "en-US",
    name: "English (United States)",
  };

  const createMockLanguageContent = (content: string): LanguageContent => ({
    content,
    frontmatter: {},
    path: "/mock/path.md",
    relativePath: "/mock/path.md",
    hash: "mock-hash",
  });

  const createMockTreeNode = (
    path: string,
    content: string,
    languageCode = "en-US",
  ): TreeNode => ({
    name: "mock-node",
    path,
    relativePath: path,
    isIndexPage: false,
    isDirectory: false,
    weight: 0,
    languages: new Map([[languageCode, createMockLanguageContent(content)]]),
    children: [],
    parent: null,
  });

  test("should generate ask prompt with basic question", () => {
    const question = "What is the main topic of this documentation?";
    const nodes = [
      createMockTreeNode(
        "/content/intro.md",
        "# Introduction\nThis is an introduction to our product.",
      ),
    ];

    const result = buildAskPrompt(question, nodes, mockLanguage, [], []);

    expect(result.prompt).toContain(
      "Your task is the answer the following query related to the specified content:",
    );
    expect(result.prompt).toContain(
      "What is the main topic of this documentation?",
    );
    expect(result.context).toContain(
      "The content is written in English (United States) provided in Markdown format below",
    );
    expect(result.context).toContain('<file path="/content/intro.md">');
    expect(result.context).toContain(
      "# Introduction\nThis is an introduction to our product.",
    );
  });

  test("should include all content from flattened tree", () => {
    const question = "How many sections are there?";
    const nodes = [
      createMockTreeNode("/section1.md", "# Section 1\nFirst section content"),
      createMockTreeNode("/section2.md", "# Section 2\nSecond section content"),
      createMockTreeNode("/section3.md", "# Section 3\nThird section content"),
    ];

    const result = buildAskPrompt(question, nodes, mockLanguage, [], []);

    expect(result.context).toContain("# Section 1\nFirst section content");
    expect(result.context).toContain("# Section 2\nSecond section content");
    expect(result.context).toContain("# Section 3\nThird section content");
    expect(result.context).toContain('<file path="/section1.md">');
    expect(result.context).toContain('<file path="/section2.md">');
    expect(result.context).toContain('<file path="/section3.md">');
  });

  test("should include style guides in context", () => {
    const question = "Does the content follow our style guidelines?";
    const nodes = [
      createMockTreeNode("/content.md", "# Content\nSample content here."),
    ];
    const styleGuides = [
      "Use active voice whenever possible",
      "Keep sentences concise and clear",
      "Use proper heading hierarchy",
    ];

    const result = buildAskPrompt(
      question,
      nodes,
      mockLanguage,
      styleGuides,
      [],
    );

    expect(result.context).toContain("style guidelines");
    expect(result.context).toContain("Use active voice whenever possible");
    expect(result.context).toContain("Keep sentences concise and clear");
    expect(result.context).toContain("Use proper heading hierarchy");
    expect(result.context).toContain("<style>");
    expect(result.context).toContain("</style>");
  });

  test("should include exemplar nodes in context", () => {
    const question = "How does this content compare to our examples?";
    const nodes = [
      createMockTreeNode("/content.md", "# Content\nSample content here."),
    ];
    const exemplarNodes = [
      createMockTreeNode(
        "/examples/good-example.md",
        "# Good Example\nThis is how content should be written.",
      ),
      createMockTreeNode(
        "/examples/best-practice.md",
        "# Best Practice\nFollow these patterns for quality content.",
      ),
    ];
    const exemplars: Exemplar[] = [
      {
        path: "/examples",
        nodes: exemplarNodes,
      },
    ];

    const result = buildAskPrompt(question, nodes, mockLanguage, [], exemplars);

    expect(result.context).toContain('<example path="/examples">');
    expect(result.context).toContain(
      '<example_file path="/examples/good-example.md">',
    );
    expect(result.context).toContain(
      "# Good Example\nThis is how content should be written.",
    );
    expect(result.context).toContain(
      '<example_file path="/examples/best-practice.md">',
    );
    expect(result.context).toContain(
      "# Best Practice\nFollow these patterns for quality content.",
    );
    expect(result.context).toContain(
      "The following content has been provided as a reference",
    );
  });

  test("should handle complex questions with special characters", () => {
    const question =
      'What are the "key features" mentioned in section 2.1? How do they relate to the API endpoints?';
    const nodes = [
      createMockTreeNode(
        "/api-docs.md",
        "# API Documentation\n## Section 2.1\nKey features include authentication & rate limiting.",
      ),
    ];

    const result = buildAskPrompt(question, nodes, mockLanguage, [], []);

    expect(result.prompt).toContain(
      'What are the "key features" mentioned in section 2.1? How do they relate to the API endpoints?',
    );
    expect(result.context).toContain(
      "Key features include authentication &amp; rate limiting.",
    );
  });

  test("should handle empty question", () => {
    const question = "";
    const nodes = [
      createMockTreeNode("/content.md", "# Content\nSample content here."),
    ];

    const result = buildAskPrompt(question, nodes, mockLanguage, [], []);

    expect(result.prompt).toContain(
      "Your task is the answer the following query related to the specified content:",
    );
    expect(result.prompt).toContain("\n\n"); // Empty question should still be included
  });

  test("should handle multiline questions", () => {
    const question = `Can you analyze the following aspects:
1. Code quality
2. Documentation completeness
3. Best practices adherence

Please provide detailed feedback for each.`;
    const nodes = [
      createMockTreeNode(
        "/code-review.md",
        "# Code Review\nCode examples here.",
      ),
    ];

    const result = buildAskPrompt(question, nodes, mockLanguage, [], []);

    expect(result.prompt).toContain("Can you analyze the following aspects:");
    expect(result.prompt).toContain("1. Code quality");
    expect(result.prompt).toContain("2. Documentation completeness");
    expect(result.prompt).toContain("3. Best practices adherence");
    expect(result.prompt).toContain(
      "Please provide detailed feedback for each.",
    );
  });

  test("should work with different languages", () => {
    const frenchLanguage: Language = {
      code: "fr-FR",
      name: "Français",
    };
    const question = "Quelle est la structure de ce document?";
    const nodes = [
      createMockTreeNode(
        "/contenu.md",
        "# Contenu\nCeci est du contenu en français.",
        "fr-FR",
      ),
    ];

    const result = buildAskPrompt(question, nodes, frenchLanguage, [], []);

    expect(result.prompt).toContain("Quelle est la structure de ce document?");
    expect(result.context).toContain("written in Français");
    expect(result.context).toContain("Ceci est du contenu en français.");
  });

  test("should handle empty tree", () => {
    const question = "What content is available?";

    const result = buildAskPrompt(question, [], mockLanguage, [], []);

    expect(result.prompt).toContain("What content is available?");
    expect(result.context).toContain("<content_files></content_files>");
  });

  test("should handle empty style guides and exemplars", () => {
    const question = "What is the content about?";
    const nodes = [
      createMockTreeNode("/content.md", "# Content\nSample content here."),
    ];

    const result = buildAskPrompt(question, nodes, mockLanguage, [], []);

    expect(result.context).not.toContain("style guidelines");
    expect(result.context).not.toContain("example_files");
    expect(result.context).toContain("# Content\nSample content here.");
  });

  test("should preserve content formatting in context", () => {
    const question = "How is the code formatted?";
    const complexContent = `# Code Examples

Here's a JavaScript example:

\`\`\`javascript
function hello(name) {
  console.log(\`Hello, \${name}!\`);
}
\`\`\`

And some HTML:

\`\`\`html
<div class="example">
  <p>Example content</p>
</div>
\`\`\``;

    const nodes = [createMockTreeNode("/examples.md", complexContent)];

    const result = buildAskPrompt(question, nodes, mockLanguage, [], []);

    expect(result.context).toContain("```javascript");
    expect(result.context).toContain("function hello(name)");
    expect(result.context).toContain("```html");
    expect(result.context).toContain("&lt;div class=&quot;example&quot;&gt;");
  });

  test("should handle questions with handlebars-like syntax", () => {
    const question = "What does {{variable}} mean in this context?";
    const nodes = [
      createMockTreeNode(
        "/templates.md",
        "# Templates\nUse {{variable}} for dynamic content.",
      ),
    ];

    const result = buildAskPrompt(question, nodes, mockLanguage, [], []);

    expect(result.prompt).toContain(
      "What does {{variable}} mean in this context?",
    );
    expect(result.context).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: Checked above
    expect(result.context!).toContain("Use {{variable}} for dynamic content.");
  });

  test("should return prompt object with correct structure", () => {
    const question = "Test question";
    const nodes = [createMockTreeNode("/test.md", "Test content")];

    const result = buildAskPrompt(question, nodes, mockLanguage, [], []);

    expect(result).toHaveProperty("prompt");
    expect(result).toHaveProperty("context");
    expect(typeof result.prompt).toBe("string");
    expect(result.context).toBeDefined();
    expect(typeof result.context).toBe("string");
    expect(result.prompt.length).toBeGreaterThan(0);
    // biome-ignore lint/style/noNonNullAssertion: Checked above
    expect(result.context!.length).toBeGreaterThan(0);
  });

  test("should handle very long questions", () => {
    const longQuestion = `${"A".repeat(1000)} - what does this mean?` as const;
    const nodes = [createMockTreeNode("/content.md", "Short content")];

    const result = buildAskPrompt(longQuestion, nodes, mockLanguage, [], []);

    expect(result.prompt).toContain(longQuestion);
    expect(result.prompt.length).toBeGreaterThan(1000);
  });
});
