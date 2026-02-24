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
import { checkLinks } from "../../src/check/linkChecker.js";
import { ContentTree, MockProvider } from "../../src/content/index.js";
import type { LinkReference } from "../../src/content/tree/ContentNode.js";

describe("checkLinks", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "linkchecker-"));
    await mkdir(join(tempDir, "docs"), { recursive: true });
    await writeFile(join(tempDir, "docs", "existing.md"), "# Existing");
    await writeFile(join(tempDir, "other.md"), "# Other");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("should return no issues for valid local links", async () => {
    const links: LinkReference[] = [
      { url: "./existing.md", text: "Existing", line: 1, remote: false },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
    );
    expect(issues).toEqual([]);
  });

  test("should detect broken local links", async () => {
    const links: LinkReference[] = [
      { url: "./missing.md", text: "Missing", line: 3, remote: false },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].category).toBe("link");
    expect(issues[0].rule).toBe("broken-link");
    expect(issues[0].line).toBe(3);
  });

  test("should resolve absolute links relative to content dir", async () => {
    const links: LinkReference[] = [
      { url: "/other.md", text: "Other", line: 1, remote: false },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
    );
    expect(issues).toEqual([]);
  });

  test("should detect broken absolute links", async () => {
    const links: LinkReference[] = [
      { url: "/nonexistent.md", text: "Missing", line: 2, remote: false },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe("broken-link");
  });

  test("should skip fragment-only links", async () => {
    const links: LinkReference[] = [
      { url: "#section", text: "Section", line: 1, remote: false },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
    );
    expect(issues).toEqual([]);
  });

  test("should strip fragments from local links before checking", async () => {
    const links: LinkReference[] = [
      {
        url: "./existing.md#section",
        text: "Existing",
        line: 1,
        remote: false,
      },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
    );
    expect(issues).toEqual([]);
  });

  test("should skip external links when skipExternal is true", async () => {
    const links: LinkReference[] = [
      {
        url: "https://example.com/page",
        text: "External",
        line: 1,
        remote: true,
      },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      true,
    );
    expect(issues).toEqual([]);
  });

  test("should handle empty links array", async () => {
    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      [],
      tempDir,
      5000,
      false,
    );
    expect(issues).toEqual([]);
  });

  test("should handle links with empty url after fragment strip", async () => {
    const links: LinkReference[] = [
      { url: "#", text: "Hash", line: 1, remote: false },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
    );
    expect(issues).toEqual([]);
  });

  test("should resolve static prefix links against static directory", async () => {
    const staticDir = join(tempDir, "static");
    await mkdir(join(staticDir, "img"), { recursive: true });
    await writeFile(join(staticDir, "img", "logo.png"), "fake-png");

    const links: LinkReference[] = [
      { url: "/static/img/logo.png", text: "Logo", line: 1, remote: false },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
      "/static/",
      staticDir,
    );
    expect(issues).toEqual([]);
  });

  test("should detect broken static prefix links", async () => {
    const staticDir = join(tempDir, "static");
    await mkdir(staticDir, { recursive: true });

    const links: LinkReference[] = [
      {
        url: "/static/img/missing.png",
        text: "Missing",
        line: 4,
        remote: false,
      },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
      "/static/",
      staticDir,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe("broken-link");
    expect(issues[0].line).toBe(4);
  });

  test("should fall back to normal local link resolution without static config", async () => {
    const links: LinkReference[] = [
      { url: "/static/img/logo.png", text: "Logo", line: 1, remote: false },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe("broken-link");
  });

  test("should strip fragments from static prefix links", async () => {
    const staticDir = join(tempDir, "static");
    await mkdir(join(staticDir, "docs"), { recursive: true });
    await writeFile(join(staticDir, "docs", "page.md"), "# Page");

    const links: LinkReference[] = [
      {
        url: "/static/docs/page.md#section",
        text: "Page",
        line: 1,
        remote: false,
      },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
      "/static/",
      staticDir,
    );
    expect(issues).toEqual([]);
  });

  test("should skip links matching ignore patterns", async () => {
    const links: LinkReference[] = [
      { url: "./missing.md", text: "Missing", line: 1, remote: false },
      {
        url: "https://internal.example.com/page",
        text: "Internal",
        line: 2,
        remote: true,
      },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
      undefined,
      undefined,
      ["missing\\.md$", "^https://internal\\.example\\.com"],
    );
    expect(issues).toEqual([]);
  });

  test("should still report links not matching ignore patterns", async () => {
    const links: LinkReference[] = [
      { url: "./missing.md", text: "Missing", line: 1, remote: false },
      { url: "./also-missing.md", text: "Also", line: 2, remote: false },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
      undefined,
      undefined,
      ["also-missing"],
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("missing.md");
  });

  test("should handle empty ignore patterns array", async () => {
    const links: LinkReference[] = [
      { url: "./missing.md", text: "Missing", line: 1, remote: false },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
      undefined,
      undefined,
      [],
    );
    expect(issues).toHaveLength(1);
  });

  test("should resolve link via content tree before filesystem", async () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);
    tree.add("docs/guide.md", "# Guide");
    tree.add("docs/tutorial.md", "# Tutorial");

    const links: LinkReference[] = [
      { url: "./tutorial", text: "Tutorial", line: 1, remote: false },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
      undefined,
      undefined,
      [],
      tree,
      "docs/guide",
    );
    expect(issues).toEqual([]);
  });

  test("should resolve absolute link via content tree", async () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);
    tree.add("basics/pods.md", "# Pods");

    const links: LinkReference[] = [
      { url: "/basics/pods", text: "Pods", line: 1, remote: false },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
      undefined,
      undefined,
      [],
      tree,
      "advanced/secrets/index",
    );
    expect(issues).toEqual([]);
  });

  test("should fall back to filesystem when tree cannot resolve", async () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);
    tree.add("docs/guide.md", "# Guide");

    const links: LinkReference[] = [
      { url: "./existing.md", text: "Existing", line: 1, remote: false },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
      undefined,
      undefined,
      [],
      tree,
      "docs/guide",
    );
    expect(issues).toEqual([]);
  });

  test("should report broken link when neither tree nor filesystem resolves", async () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);
    tree.add("docs/guide.md", "# Guide");

    const links: LinkReference[] = [
      { url: "./totally-missing", text: "Missing", line: 5, remote: false },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
      undefined,
      undefined,
      [],
      tree,
      "docs/guide",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe("broken-link");
  });

  test("should resolve link with .md extension via content tree", async () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);
    tree.add("docs/guide.md", "# Guide");
    tree.add("docs/tutorial.md", "# Tutorial");

    const links: LinkReference[] = [
      { url: "./tutorial.md", text: "Tutorial", line: 1, remote: false },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
      undefined,
      undefined,
      [],
      tree,
      "docs/guide",
    );
    expect(issues).toEqual([]);
  });

  test("should work without content tree (backward compatible)", async () => {
    const links: LinkReference[] = [
      { url: "./existing.md", text: "Existing", line: 1, remote: false },
    ];

    const issues = await checkLinks(
      join(tempDir, "docs", "test.md"),
      links,
      tempDir,
      5000,
      false,
    );
    expect(issues).toEqual([]);
  });
});
