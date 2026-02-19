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

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { checkAll } from "../../src/check/checker.js";
import type { CheckOptions } from "../../src/check/types.js";
import type { ContentNode } from "../../src/content/tree/ContentNode.js";

function createTestNode(
  overrides: Partial<ContentNode> & { filePath: string },
): ContentNode {
  return {
    name: "test",
    path: "test",
    isDirectory: false,
    weight: 0,
    children: [],
    parent: null,
    content: "# Test\n",
    frontmatter: {},
    language: "en",
    hash: "abc",
    images: [],
    links: [],
    codeBlocks: [],
    ...overrides,
  };
}

describe("checkAll", () => {
  let tempDir: string;
  let defaultOptions: CheckOptions;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "checker-"));
    await mkdir(join(tempDir, "docs"), { recursive: true });
    await writeFile(join(tempDir, "docs", "existing.md"), "# Existing");

    defaultOptions = {
      contentDir: tempDir,
      links: { timeout: 5000, skipExternal: true },
      lint: { ignoreRules: [] },
    };
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("should return clean results for valid content", async () => {
    const nodes = [
      createTestNode({
        filePath: join(tempDir, "docs", "valid.md"),
        content: "# Valid Heading\n\nSome paragraph text.\n",
      }),
    ];

    const result = await checkAll(nodes, defaultOptions);
    expect(result.totalErrors).toBe(0);
    expect(result.totalWarnings).toBe(0);
    expect(result.files).toHaveLength(1);
  });

  test("should skip directory nodes", async () => {
    const nodes = [
      createTestNode({
        filePath: join(tempDir, "docs"),
        isDirectory: true,
        content: null,
      }),
    ];

    const result = await checkAll(nodes, defaultOptions);
    expect(result.files).toHaveLength(0);
  });

  test("should skip nodes without content", async () => {
    const nodes = [
      createTestNode({
        filePath: join(tempDir, "docs", "empty.md"),
        content: null,
      }),
    ];

    const result = await checkAll(nodes, defaultOptions);
    expect(result.files).toHaveLength(0);
  });

  test("should aggregate lint warnings", async () => {
    const nodes = [
      createTestNode({
        filePath: join(tempDir, "docs", "bad.md"),
        content: "#Bad Heading\n",
      }),
    ];

    const result = await checkAll(nodes, defaultOptions);
    expect(result.totalWarnings).toBeGreaterThan(0);
    expect(result.files[0].issues.some((i) => i.category === "lint")).toBe(
      true,
    );
  });

  test("should detect broken local links", async () => {
    const nodes = [
      createTestNode({
        filePath: join(tempDir, "docs", "test.md"),
        content: "# Test\n\n[Missing](./missing.md)\n",
        links: [
          { url: "./missing.md", text: "Missing", line: 3, remote: false },
        ],
      }),
    ];

    const result = await checkAll(nodes, defaultOptions);
    expect(result.totalErrors).toBeGreaterThan(0);
    expect(result.files[0].issues.some((i) => i.rule === "broken-link")).toBe(
      true,
    );
  });

  test("should detect missing images", async () => {
    const nodes = [
      createTestNode({
        filePath: join(tempDir, "docs", "test.md"),
        content: "# Test\n\n![Missing](./missing.png)\n",
        images: [
          { path: "./missing.png", alt: "Missing", line: 3, remote: false },
        ],
      }),
    ];

    const result = await checkAll(nodes, defaultOptions);
    expect(result.totalErrors).toBeGreaterThan(0);
    expect(result.files[0].issues.some((i) => i.rule === "missing-image")).toBe(
      true,
    );
  });

  test("should process multiple files", async () => {
    await writeFile(join(tempDir, "docs", "target.md"), "# Target");

    const nodes = [
      createTestNode({
        filePath: join(tempDir, "docs", "good.md"),
        content: "# Good\n\nParagraph.\n",
        links: [{ url: "./target.md", text: "Target", line: 3, remote: false }],
      }),
      createTestNode({
        filePath: join(tempDir, "docs", "bad.md"),
        content: "# Bad\n\n[Missing](./nope.md)\n",
        links: [{ url: "./nope.md", text: "Missing", line: 3, remote: false }],
      }),
    ];

    const result = await checkAll(nodes, defaultOptions);
    expect(result.files).toHaveLength(2);
    expect(result.totalErrors).toBeGreaterThan(0);
  });

  test("should respect ignoreRules option", async () => {
    const content = "#Bad Heading\n";
    const nodes = [
      createTestNode({
        filePath: join(tempDir, "docs", "test.md"),
        content,
      }),
    ];

    const resultWithout = await checkAll(nodes, defaultOptions);

    const resultWith = await checkAll(nodes, {
      ...defaultOptions,
      lint: { ignoreRules: ["MD018", "MD041"] },
    });

    expect(resultWithout.totalWarnings).toBeGreaterThan(
      resultWith.totalWarnings,
    );
  });

  test("should count errors and warnings separately", async () => {
    const nodes = [
      createTestNode({
        filePath: join(tempDir, "docs", "test.md"),
        content: "#Bad Heading\n\n[Missing](./nope.md)\n",
        links: [{ url: "./nope.md", text: "Missing", line: 3, remote: false }],
      }),
    ];

    const result = await checkAll(nodes, defaultOptions);
    expect(result.totalErrors).toBeGreaterThan(0);
    expect(result.totalWarnings).toBeGreaterThan(0);
  });

  test("should resolve absolute non-static links against rootContentDir", async () => {
    const subDir = join(tempDir, "sub");
    await mkdir(subDir, { recursive: true });
    await writeFile(join(tempDir, "root-file.md"), "# Root");

    const nodes = [
      createTestNode({
        filePath: "test.md",
        content: "# Test\n\n[Root](/root-file.md)\n",
        links: [{ url: "/root-file.md", text: "Root", line: 3, remote: false }],
      }),
    ];

    const result = await checkAll(nodes, {
      ...defaultOptions,
      contentDir: subDir,
      rootContentDir: tempDir,
    });
    expect(result.totalErrors).toBe(0);
  });

  test("should filter issues by minSeverity", async () => {
    const nodes = [
      createTestNode({
        filePath: join(tempDir, "docs", "test.md"),
        content: "#Bad Heading\n\n[Missing](./nope.md)\n",
        links: [{ url: "./nope.md", text: "Missing", line: 3, remote: false }],
      }),
    ];

    const allResult = await checkAll(nodes, defaultOptions);
    expect(allResult.totalErrors).toBeGreaterThan(0);
    expect(allResult.totalWarnings).toBeGreaterThan(0);

    const errorsOnly = await checkAll(nodes, {
      ...defaultOptions,
      minSeverity: "error",
    });
    expect(errorsOnly.totalErrors).toBeGreaterThan(0);
    expect(errorsOnly.totalWarnings).toBe(0);
  });

  test("should filter issues by categories", async () => {
    const nodes = [
      createTestNode({
        filePath: join(tempDir, "docs", "test.md"),
        content: "#Bad Heading\n\n[Missing](./nope.md)\n",
        links: [{ url: "./nope.md", text: "Missing", line: 3, remote: false }],
      }),
    ];

    const lintOnly = await checkAll(nodes, {
      ...defaultOptions,
      categories: ["lint"],
    });
    expect(lintOnly.files[0].issues.every((i) => i.category === "lint")).toBe(
      true,
    );

    const linkOnly = await checkAll(nodes, {
      ...defaultOptions,
      categories: ["link"],
    });
    expect(linkOnly.files[0].issues.every((i) => i.category === "link")).toBe(
      true,
    );
  });

  test("should run all categories when none specified", async () => {
    const nodes = [
      createTestNode({
        filePath: join(tempDir, "docs", "test.md"),
        content: "#Bad Heading\n\n[Missing](./nope.md)\n",
        links: [{ url: "./nope.md", text: "Missing", line: 3, remote: false }],
      }),
    ];

    const result = await checkAll(nodes, defaultOptions);
    const categories = new Set(result.files[0].issues.map((i) => i.category));
    expect(categories.has("lint")).toBe(true);
    expect(categories.has("link")).toBe(true);
  });
});
