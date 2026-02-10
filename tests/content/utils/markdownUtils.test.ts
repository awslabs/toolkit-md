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
  extractImagePaths,
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

describe("extractImagePaths", () => {
  test("should extract markdown image paths", () => {
    const content = `# Guide
![Alt text](./images/diagram.png)
Some text
![Another](../assets/photo.jpg)`;

    const paths = extractImagePaths(content);
    expect(paths).toEqual(["./images/diagram.png", "../assets/photo.jpg"]);
  });

  test("should extract HTML img src paths", () => {
    const content = `<img src="./image.png" alt="test" />
<img src="../other.jpg">`;

    const paths = extractImagePaths(content);
    expect(paths).toEqual(["./image.png", "../other.jpg"]);
  });

  test("should exclude HTTP/HTTPS URLs", () => {
    const content = `![Remote](https://example.com/image.png)
![Local](./local.png)
<img src="http://example.com/other.jpg">`;

    const paths = extractImagePaths(content);
    expect(paths).toEqual(["./local.png"]);
  });

  test("should handle mixed markdown and HTML images", () => {
    const content = `![MD](./md.png)
<img src="./html.jpg">
![URL](https://example.com/remote.png)`;

    const paths = extractImagePaths(content);
    expect(paths).toEqual(["./md.png", "./html.jpg"]);
  });

  test("should return unique paths", () => {
    const content = `![One](./image.png)
![Two](./image.png)
<img src="./image.png">`;

    const paths = extractImagePaths(content);
    expect(paths).toEqual(["./image.png"]);
  });

  test("should return empty array when no images", () => {
    const content = "# Just text\nNo images here.";
    const paths = extractImagePaths(content);
    expect(paths).toEqual([]);
  });
});
