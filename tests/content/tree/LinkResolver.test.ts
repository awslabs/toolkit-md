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
  ContentTree,
  LinkResolver,
  MockProvider,
} from "../../../src/content/index.js";

function buildTree(entries: Array<{ path: string; content: string }>) {
  const provider = new MockProvider();
  const tree = new ContentTree(provider);
  entries.forEach(({ path, content }) => tree.add(path, content));
  return tree;
}

describe("LinkResolver", () => {
  test("should resolve relative link to sibling file", () => {
    const tree = buildTree([
      { path: "docs/guide.md", content: "# Guide" },
      { path: "docs/tutorial.md", content: "# Tutorial" },
    ]);

    const result = new LinkResolver(tree).resolve("./tutorial", "docs/guide");
    expect(result).not.toBeNull();
    expect(result?.name).toBe("tutorial");
  });

  test("should resolve relative link with .md extension", () => {
    const tree = buildTree([
      { path: "docs/guide.md", content: "# Guide" },
      { path: "docs/tutorial.md", content: "# Tutorial" },
    ]);

    const result = new LinkResolver(tree).resolve(
      "./tutorial.md",
      "docs/guide",
    );
    expect(result).not.toBeNull();
    expect(result?.name).toBe("tutorial");
  });

  test("should resolve absolute link from root", () => {
    const tree = buildTree([{ path: "docs/guide.md", content: "# Guide" }]);

    const result = new LinkResolver(tree).resolve("/docs/guide", "other/page");
    expect(result).not.toBeNull();
    expect(result?.name).toBe("guide");
  });

  test("should resolve parent-relative link with ../", () => {
    const tree = buildTree([
      { path: "docs/guide.md", content: "# Guide" },
      { path: "api/reference.md", content: "# Reference" },
    ]);

    const result = new LinkResolver(tree).resolve(
      "../api/reference",
      "docs/guide",
    );
    expect(result).not.toBeNull();
    expect(result?.name).toBe("reference");
  });

  test("should resolve directory link to index file", () => {
    const tree = buildTree([
      { path: "docs/index.md", content: "# Docs Index" },
      { path: "docs/guide.md", content: "# Guide" },
    ]);

    const result = new LinkResolver(tree).resolve("/docs/", "other/page");
    expect(result).not.toBeNull();
    expect(result?.name).toBe("index");
  });

  test("should resolve link with fragment", () => {
    const tree = buildTree([{ path: "docs/guide.md", content: "# Guide" }]);

    const result = new LinkResolver(tree).resolve(
      "./guide#section",
      "docs/other",
    );
    expect(result).not.toBeNull();
    expect(result?.name).toBe("guide");
  });

  test("should return null for non-existent link", () => {
    const tree = buildTree([{ path: "docs/guide.md", content: "# Guide" }]);

    const result = new LinkResolver(tree).resolve("./missing", "docs/guide");
    expect(result).toBeNull();
  });

  test("should return null for empty url after stripping fragment", () => {
    const tree = buildTree([{ path: "docs/guide.md", content: "# Guide" }]);

    const result = new LinkResolver(tree).resolve("#section", "docs/guide");
    expect(result).toBeNull();
  });

  test("should resolve link with language suffix in url", () => {
    const tree = buildTree([{ path: "docs/guide.md", content: "# Guide" }]);

    const result = new LinkResolver(tree).resolve(
      "./guide.en.md",
      "docs/other",
    );
    expect(result).not.toBeNull();
    expect(result?.name).toBe("guide");
  });
});
