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
import {
  extractMarkdownElements,
  parseMarkdownContent,
} from "../../../src/content/utils/markdownUtils.js";

describe("Markdown Utils", () => {
  test("should parse markdown content", () => {
    const content = `---
title: Test Guide
weight: 15
---
# Test Guide

This is test content.`;

    const parsed = parseMarkdownContent(content);

    expect(parsed.frontmatter.title).toBe("Test Guide");
    expect(parsed.frontmatter.weight).toBe(15);
    expect(parsed.weight).toBe(15);
    expect(parsed.content).toBe(content);
    expect(parsed.hash).toBeDefined();
  });

  test("should prioritize weight over sidebar_position", () => {
    const content = `---
weight: 5
sidebar_position: 10
---
# Content`;

    const parsed = parseMarkdownContent(content);
    expect(parsed.weight).toBe(5);
  });

  test("should use sidebar_position when weight is missing", () => {
    const content = `---
sidebar_position: 7
---
# Content`;

    const parsed = parseMarkdownContent(content);
    expect(parsed.weight).toBe(7);
  });

  test("should default to 999 when no weight properties", () => {
    const content = `---
title: Content
---
# Content`;

    const parsed = parseMarkdownContent(content);
    expect(parsed.weight).toBe(999);
  });
});

describe("extractMarkdownElements - images", () => {
  test("should extract markdown image references with alt text and line numbers", () => {
    const content = `# Guide
![Alt text](./images/diagram.png)
Some text
![Another](../assets/photo.jpg)`;

    const { images } = extractMarkdownElements(content);
    expect(images).toEqual([
      { path: "./images/diagram.png", alt: "Alt text", line: 2, remote: false },
      { path: "../assets/photo.jpg", alt: "Another", line: 4, remote: false },
    ]);
  });

  test("should extract HTML img src paths with alt text", () => {
    const content = `Some text

<img src="./image.png" alt="test" />

More text

<img src="../other.jpg">`;

    const { images } = extractMarkdownElements(content);
    expect(images).toEqual([
      { path: "./image.png", alt: "test", line: 3, remote: false },
      { path: "../other.jpg", alt: null, line: 7, remote: false },
    ]);
  });

  test("should flag remote images with remote: true", () => {
    const content = `![Remote](https://example.com/image.png)
![Local](./local.png)
<img src="http://example.com/other.jpg">`;

    const { images } = extractMarkdownElements(content);
    expect(images).toEqual([
      { path: "https://example.com/image.png", alt: "Remote", line: 1, remote: true },
      { path: "./local.png", alt: "Local", line: 2, remote: false },
      { path: "http://example.com/other.jpg", alt: null, line: 3, remote: true },
    ]);
  });

  test("should handle mixed markdown and HTML images", () => {
    const content = `![MD](./md.png)
<img src="./html.jpg">
![URL](https://example.com/remote.png)`;

    const { images } = extractMarkdownElements(content);
    expect(images).toEqual([
      { path: "./md.png", alt: "MD", line: 1, remote: false },
      { path: "./html.jpg", alt: null, line: 2, remote: false },
      { path: "https://example.com/remote.png", alt: "URL", line: 3, remote: true },
    ]);
  });

  test("should return unique paths", () => {
    const content = `![One](./image.png)
![Two](./image.png)
<img src="./image.png">`;

    const { images } = extractMarkdownElements(content);
    expect(images).toEqual([
      { path: "./image.png", alt: "One", line: 1, remote: false },
    ]);
  });

  test("should return empty array when no images", () => {
    const content = "# Just text\nNo images here.";
    const { images } = extractMarkdownElements(content);
    expect(images).toEqual([]);
  });

  test("should set alt to null for images without alt text", () => {
    const content = "![](./no-alt.png)";
    const { images } = extractMarkdownElements(content);
    expect(images).toEqual([
      { path: "./no-alt.png", alt: null, line: 1, remote: false },
    ]);
  });
});

describe("extractMarkdownElements - image directives", () => {
  test("should extract leaf directive images", () => {
    const content = `# Guide

:image[A fun illustration]{src="/static/img/illus.png"}`;

    const { images } = extractMarkdownElements(content);
    expect(images).toEqual([
      { path: "/static/img/illus.png", alt: "A fun illustration", line: 3, remote: false },
    ]);
  });

  test("should handle directive images without alt text", () => {
    const content = `::image{src="/static/img/photo.png"}`;

    const { images } = extractMarkdownElements(content);
    expect(images).toEqual([
      { path: "/static/img/photo.png", alt: null, line: 1, remote: false },
    ]);
  });

  test("should flag remote directive images with remote: true", () => {
    const content = `::image[Remote]{src="https://example.com/img.png"}
::image[Local]{src="./local.png"}`;

    const { images } = extractMarkdownElements(content);
    expect(images).toEqual([
      { path: "https://example.com/img.png", alt: "Remote", line: 1, remote: true },
      { path: "./local.png", alt: "Local", line: 2, remote: false },
    ]);
  });

  test("should deduplicate directive images with standard images", () => {
    const content = `![Alt](./shared.png)
::image[Directive]{src="./shared.png"}`;

    const { images } = extractMarkdownElements(content);
    expect(images).toEqual([
      { path: "./shared.png", alt: "Alt", line: 1, remote: false },
    ]);
  });

  test("should handle mixed standard and directive images", () => {
    const content = `![Standard](./standard.png)
::image[Directive]{src="/static/directive.png"}
<img src="./html.jpg" alt="HTML">`;

    const { images } = extractMarkdownElements(content);
    expect(images).toEqual([
      { path: "./standard.png", alt: "Standard", line: 1, remote: false },
      { path: "/static/directive.png", alt: "Directive", line: 2, remote: false },
      { path: "./html.jpg", alt: "HTML", line: 3, remote: false },
    ]);
  });
});

describe("extractMarkdownElements - codeBlocks", () => {
  test("should extract fenced code blocks with language and line number", () => {
    const content = `# Guide

\`\`\`typescript
const x = 1;
\`\`\`

Some text

\`\`\`python
print("hello")
\`\`\``;

    const { codeBlocks } = extractMarkdownElements(content);
    expect(codeBlocks).toEqual([
      { language: "typescript", code: "const x = 1;", line: 3 },
      { language: "python", code: 'print("hello")', line: 9 },
    ]);
  });

  test("should set language to null for code blocks without a language", () => {
    const content = `\`\`\`
plain code
\`\`\``;

    const { codeBlocks } = extractMarkdownElements(content);
    expect(codeBlocks).toEqual([
      { language: null, code: "plain code", line: 1 },
    ]);
  });

  test("should return empty array when no code blocks", () => {
    const content = "# Just text\nNo code here.";
    const { codeBlocks } = extractMarkdownElements(content);
    expect(codeBlocks).toEqual([]);
  });

  test("should not extract inline code", () => {
    const content = "Use `const x = 1` in your code.";
    const { codeBlocks } = extractMarkdownElements(content);
    expect(codeBlocks).toEqual([]);
  });

  test("should preserve multiline code content", () => {
    const content = `\`\`\`yaml
key: value
nested:
  child: true
\`\`\``;

    const { codeBlocks } = extractMarkdownElements(content);
    expect(codeBlocks).toEqual([
      { language: "yaml", code: "key: value\nnested:\n  child: true", line: 1 },
    ]);
  });

  test("should extract multiple code blocks in order", () => {
    const content = `\`\`\`js
a()
\`\`\`

\`\`\`
b()
\`\`\`

\`\`\`bash
c
\`\`\``;

    const { codeBlocks } = extractMarkdownElements(content);
    expect(codeBlocks).toHaveLength(3);
    expect(codeBlocks[0]).toEqual({ language: "js", code: "a()", line: 1 });
    expect(codeBlocks[1]).toEqual({ language: null, code: "b()", line: 5 });
    expect(codeBlocks[2]).toEqual({ language: "bash", code: "c", line: 9 });
  });
});

describe("extractMarkdownElements - title", () => {
  test("should extract h1 heading as title", () => {
    const content = "# My Guide\nSome content";
    const { title } = extractMarkdownElements(content);
    expect(title).toBe("My Guide");
  });

  test("should return null when no h1 heading exists", () => {
    const content = "## Not a title\nSome content";
    const { title } = extractMarkdownElements(content);
    expect(title).toBeNull();
  });

  test("should only extract the first h1 heading", () => {
    const content = "# First Title\n# Second Title";
    const { title } = extractMarkdownElements(content);
    expect(title).toBe("First Title");
  });

  test("should extract h1 after frontmatter", () => {
    const content = "# Page Title\n\nSome paragraph text";
    const { title } = extractMarkdownElements(content);
    expect(title).toBe("Page Title");
  });

  test("should return null for content with no headings", () => {
    const content = "Just plain text\nwith no headings";
    const { title } = extractMarkdownElements(content);
    expect(title).toBeNull();
  });
});
