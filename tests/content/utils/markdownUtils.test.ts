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
import { parseMarkdownContent } from "../../../src/content/utils/markdownUtils.js";

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
