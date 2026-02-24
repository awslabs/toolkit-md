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
import { ContentTree, MockProvider } from "../../../src/content/index.js";

describe("ContentTree", () => {
  test("should create empty tree", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);
    const content = tree.getContent();
    expect(content).toHaveLength(0);
  });

  test("should add content with add() method", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    const node = tree.add("/docs/guide.md", "# Guide\nThis is a guide.");

    expect(node).toBeDefined();
    expect(node?.name).toBe("guide");
    expect(node?.content).toBe("# Guide\nThis is a guide.");
    expect(node?.language).toBe("en");
    expect(node?.isDirectory).toBe(false);
  });

  test("should filter content by language", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    // Add English content (should be included)
    const enNode = tree.add("/docs/guide.md", "# English Guide");
    expect(enNode).toBeDefined();

    // Add French content (should be filtered out)
    const frNode = tree.add("/docs/guide.fr.md", "# Guide Français");
    expect(frNode).toBeNull();

    const content = tree.getContent();
    expect(content).toHaveLength(1);
    expect(content[0].language).toBe("en");
  });

  test("should create intermediate directory nodes", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    tree.add("/docs/advanced/secrets/managing.md", "# Managing Secrets");

    const docsNode = tree.getNode("/docs");
    const advancedNode = tree.getNode("/docs/advanced");
    const secretsNode = tree.getNode("/docs/advanced/secrets");
    const managingNode = tree.getNode("/docs/advanced/secrets/managing");

    expect(docsNode?.isDirectory).toBe(true);
    expect(advancedNode?.isDirectory).toBe(true);
    expect(secretsNode?.isDirectory).toBe(true);
    expect(managingNode?.isDirectory).toBe(false);
    expect(managingNode?.content).toBe("# Managing Secrets");
  });

  test("should handle weight-based sorting", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    tree.add("/docs/high.md", "---\nweight: 10\n---\n# High Priority");
    tree.add("/docs/low.md", "---\nweight: 100\n---\n# Low Priority");
    tree.add("/docs/medium.md", "---\nweight: 50\n---\n# Medium Priority");

    const docsNode = tree.getNode("/docs");
    const children = docsNode?.children || [];

    expect(children).toHaveLength(3);
    expect(children[0].name).toBe("high");
    expect(children[1].name).toBe("medium");
    expect(children[2].name).toBe("low");
  });

  test("should handle index files correctly", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    tree.add("/docs/index.md", "---\nweight: 5\n---\n# Docs Index");
    tree.add("/docs/other.md", "# Other Page");

    const indexNode = tree.getNode("/docs/index");
    const docsNode = tree.getNode("/docs");

    expect(indexNode?.weight).toBe(-1); // Index files get -1 weight
    expect(docsNode?.weight).toBe(5); // Parent gets index weight
  });

  test("should update content correctly", async () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    const node = tree.add("/docs/guide.md", "---\nweight: 10\n---\n# Guide");
    expect(node?.weight).toBe(10);

    // biome-ignore lint/style/noNonNullAssertion: TODO handle better
    await tree.updateContent(node!, "---\nweight: 5\n---\n# Updated Guide");

    expect(node?.content).toBe("---\nweight: 5\n---\n# Updated Guide");
    expect(node?.weight).toBe(5);
  });

  test("should extract image references from content", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    const content = `# Guide
![Alt text](./images/diagram.png)
Some text
![Another](../assets/photo.jpg)`;

    const node = tree.add("/docs/guide.md", content);
    expect(node?.images).toEqual([
      { path: "./images/diagram.png", alt: "Alt text", line: 2, remote: false },
      { path: "../assets/photo.jpg", alt: "Another", line: 4, remote: false },
    ]);
  });

  test("should flag remote image URLs", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    const content = `![Remote](https://example.com/image.png)
![Local](./local.png)
<img src="http://example.com/other.jpg">`;

    const node = tree.add("/docs/guide.md", content);
    expect(node?.images).toEqual([
      {
        path: "https://example.com/image.png",
        alt: "Remote",
        line: 1,
        remote: true,
      },
      { path: "./local.png", alt: "Local", line: 2, remote: false },
      {
        path: "http://example.com/other.jpg",
        alt: null,
        line: 3,
        remote: true,
      },
    ]);
  });

  test("should return empty images array for content without images", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    const node = tree.add("/docs/guide.md", "# Just text\nNo images here.");
    expect(node?.images).toEqual([]);
  });

  test("should return empty images array for directory nodes", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    tree.add("/docs/guide.md", "# Guide");
    const docsNode = tree.getNode("/docs");
    expect(docsNode?.images).toEqual([]);
  });

  test("should update images when content is updated", async () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    const node = tree.add("/docs/guide.md", "![Old](./old.png)");
    expect(node?.images).toEqual([
      { path: "./old.png", alt: "Old", line: 1, remote: false },
    ]);

    await tree.updateContent(
      // biome-ignore lint/style/noNonNullAssertion: TODO handle better
      node!,
      "![New](./new.png)\n![Another](./another.jpg)",
    );
    expect(node?.images).toEqual([
      { path: "./new.png", alt: "New", line: 1, remote: false },
      { path: "./another.jpg", alt: "Another", line: 2, remote: false },
    ]);
  });

  test("should extract code blocks from content", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    const content =
      '# Guide\n\n```typescript\nconst x = 1;\n```\n\nSome text\n\n```python\nprint("hello")\n```';

    const node = tree.add("/docs/guide.md", content);
    expect(node?.codeBlocks).toEqual([
      { language: "typescript", code: "const x = 1;", line: 3 },
      { language: "python", code: 'print("hello")', line: 9 },
    ]);
  });

  test("should return empty codeBlocks array for content without code blocks", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    const node = tree.add("/docs/guide.md", "# Just text\nNo code here.");
    expect(node?.codeBlocks).toEqual([]);
  });

  test("should return empty codeBlocks array for directory nodes", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    tree.add("/docs/guide.md", "# Guide");
    const docsNode = tree.getNode("/docs");
    expect(docsNode?.codeBlocks).toEqual([]);
  });

  test("should update codeBlocks when content is updated", async () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    const node = tree.add("/docs/guide.md", "```js\nold()\n```");
    expect(node?.codeBlocks).toEqual([
      { language: "js", code: "old()", line: 1 },
    ]);

    // biome-ignore lint/style/noNonNullAssertion: TODO handle better
    await tree.updateContent(node!, "```ts\nnewCode()\n```");
    expect(node?.codeBlocks).toEqual([
      { language: "ts", code: "newCode()", line: 1 },
    ]);
  });

  test("should return flattened tree in weight order", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    // Add content with various weights
    tree.add("/index.md", "---\nweight: 1\n---\n# Home");
    tree.add("/docs/index.md", "---\nweight: 2\n---\n# Docs");
    tree.add("/docs/guide.md", "---\nweight: 10\n---\n# Guide");
    tree.add("/docs/tutorial.md", "---\nweight: 5\n---\n# Tutorial");
    tree.add("/api/reference.md", "---\nweight: 100\n---\n# API");

    const flattened = tree.getFlattenedTree();

    // Should include only files, not directories
    expect(flattened.length).toBe(5); // 5 files
    expect(flattened.every((node) => !node.isDirectory)).toBe(true);

    // Find the positions of key files
    const indexFileIndex = flattened.findIndex(
      (n) => n.name === "index" && n.parent?.name === "",
    );
    const docsIndexFileIndex = flattened.findIndex(
      (n) => n.name === "index" && n.parent?.name === "docs",
    );
    const tutorialIndex = flattened.findIndex((n) => n.name === "tutorial");
    const guideIndex = flattened.findIndex((n) => n.name === "guide");
    const apiIndex = flattened.findIndex((n) => n.name === "reference");

    // Verify ordering based on weight and tree traversal
    // Root index file should come first (weight -1)
    expect(indexFileIndex).toBe(-1);

    // Within docs, index should come first (weight -1), then tutorial (weight 5), then guide (weight 10)
    expect(docsIndexFileIndex).toBeLessThan(tutorialIndex);
    expect(tutorialIndex).toBeLessThan(guideIndex);

    // API reference should come last (weight 100)
    expect(apiIndex).toBe(4);
  });

  test("should support getFlattenedTree with startAt parameter", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    tree.add("/docs/guide.md", "---\nweight: 10\n---\n# Guide");
    tree.add("/docs/tutorial.md", "---\nweight: 5\n---\n# Tutorial");
    tree.add("/api/reference.md", "---\nweight: 100\n---\n# API");

    // Get flattened tree starting from docs
    const docsFlattened = tree.getFlattenedTree("/docs");

    // Should only include files from docs subtree, not directories
    expect(docsFlattened.length).toBe(2); // 2 files only
    expect(docsFlattened.every((node) => !node.isDirectory)).toBe(true);
    expect(docsFlattened[0].name).toBe("tutorial"); // weight 5 comes first
    expect(docsFlattened[1].name).toBe("guide"); // weight 10 comes second
  });

  test("should use h1 heading as title when frontmatter title is missing", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    const node = tree.add("/docs/guide.md", "# My Guide\nSome content");
    expect(node?.frontmatter.title).toBe("My Guide");
  });

  test("should prefer frontmatter title over h1 heading", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    const node = tree.add(
      "/docs/guide.md",
      "---\ntitle: FM Title\n---\n# Heading Title",
    );
    expect(node?.frontmatter.title).toBe("FM Title");
  });

  test("should update title fallback when content is updated", async () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    const node = tree.add("/docs/guide.md", "# Old Title");
    expect(node?.frontmatter.title).toBe("Old Title");

    // biome-ignore lint/style/noNonNullAssertion: TODO handle better
    await tree.updateContent(node!, "# New Title");
    expect(node?.frontmatter.title).toBe("New Title");
  });

  test("should extract image directive references from content", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    const content = `# Guide
::image[A fun illustration]{src="/static/img/illus.png"}
![Standard](./standard.png)`;

    const node = tree.add("/docs/guide.md", content);
    expect(node?.images).toEqual([
      {
        path: "/static/img/illus.png",
        alt: "A fun illustration",
        line: 2,
        remote: false,
      },
      { path: "./standard.png", alt: "Standard", line: 3, remote: false },
    ]);
  });

  test("should not include images in getTreeMap by default", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    tree.add(
      "/docs/guide.md",
      "---\ntitle: Guide\n---\n![Diagram](./images/diagram.png)",
    );

    const treeMap = tree.getTreeMap();
    expect(treeMap).toContain("guide.md");
    expect(treeMap).not.toContain("./images/diagram.png");
  });

  test("should include images in getTreeMap when enabled", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    tree.add(
      "/docs/guide.md",
      "---\ntitle: Guide\n---\n![Diagram](./images/diagram.png)\n![Photo](./assets/photo.jpg)",
    );

    const treeMap = tree.getTreeMap(true);
    expect(treeMap).toContain("guide.md");
    expect(treeMap).toContain("[image] ./images/diagram.png");
    expect(treeMap).toContain("[image] ./assets/photo.jpg");
  });

  test("should render image tree connectors correctly for single image", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    tree.add(
      "/docs/guide.md",
      "---\ntitle: Guide\n---\n![Diagram](./diagram.png)",
    );

    const treeMap = tree.getTreeMap(true);
    expect(treeMap).toContain("└── [image] ./diagram.png");
  });

  test("should render image tree connectors correctly for multiple images", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    tree.add(
      "/docs/guide.md",
      "---\ntitle: Guide\n---\n![A](./a.png)\n![B](./b.png)",
    );

    const treeMap = tree.getTreeMap(true);
    expect(treeMap).toContain("├── [image] ./a.png");
    expect(treeMap).toContain("└── [image] ./b.png");
  });

  test("should not render image lines for nodes without images when enabled", () => {
    const provider = new MockProvider();
    const tree = new ContentTree(provider);

    tree.add("/docs/guide.md", "---\ntitle: Guide\n---\n# No images here");

    const treeMap = tree.getTreeMap(true);
    expect(treeMap).toContain("guide.md");
    expect(treeMap).not.toContain("├── ./");
    expect(treeMap).not.toContain("└── ./");
  });

  describe("resolveLink", () => {
    test("should resolve relative link to sibling file", () => {
      const provider = new MockProvider();
      const tree = new ContentTree(provider);
      tree.add("docs/guide.md", "# Guide");
      tree.add("docs/tutorial.md", "# Tutorial");

      const result = tree.resolveLink("./tutorial", "docs/guide");
      expect(result).not.toBeNull();
      expect(result?.name).toBe("tutorial");
    });

    test("should resolve relative link with .md extension", () => {
      const provider = new MockProvider();
      const tree = new ContentTree(provider);
      tree.add("docs/guide.md", "# Guide");
      tree.add("docs/tutorial.md", "# Tutorial");

      const result = tree.resolveLink("./tutorial.md", "docs/guide");
      expect(result).not.toBeNull();
      expect(result?.name).toBe("tutorial");
    });

    test("should resolve absolute link from root", () => {
      const provider = new MockProvider();
      const tree = new ContentTree(provider);
      tree.add("docs/guide.md", "# Guide");

      const result = tree.resolveLink("/docs/guide", "other/page");
      expect(result).not.toBeNull();
      expect(result?.name).toBe("guide");
    });

    test("should resolve parent-relative link with ../", () => {
      const provider = new MockProvider();
      const tree = new ContentTree(provider);
      tree.add("docs/guide.md", "# Guide");
      tree.add("api/reference.md", "# Reference");

      const result = tree.resolveLink("../api/reference", "docs/guide");
      expect(result).not.toBeNull();
      expect(result?.name).toBe("reference");
    });

    test("should resolve directory link to index file", () => {
      const provider = new MockProvider();
      const tree = new ContentTree(provider);
      tree.add("docs/index.md", "# Docs Index");
      tree.add("docs/guide.md", "# Guide");

      const result = tree.resolveLink("/docs/", "other/page");
      expect(result).not.toBeNull();
      expect(result?.name).toBe("index");
    });

    test("should resolve link with fragment", () => {
      const provider = new MockProvider();
      const tree = new ContentTree(provider);
      tree.add("docs/guide.md", "# Guide");

      const result = tree.resolveLink("./guide#section", "docs/other");
      expect(result).not.toBeNull();
      expect(result?.name).toBe("guide");
    });

    test("should return null for non-existent link", () => {
      const provider = new MockProvider();
      const tree = new ContentTree(provider);
      tree.add("docs/guide.md", "# Guide");

      const result = tree.resolveLink("./missing", "docs/guide");
      expect(result).toBeNull();
    });

    test("should return null for empty url after stripping fragment", () => {
      const provider = new MockProvider();
      const tree = new ContentTree(provider);
      tree.add("docs/guide.md", "# Guide");

      const result = tree.resolveLink("#section", "docs/guide");
      expect(result).toBeNull();
    });

    test("should resolve link with language suffix in url", () => {
      const provider = new MockProvider();
      const tree = new ContentTree(provider);
      tree.add("docs/guide.md", "# Guide");

      const result = tree.resolveLink("./guide.en.md", "docs/other");
      expect(result).not.toBeNull();
      expect(result?.name).toBe("guide");
    });
  });

  describe("Integration Tests", () => {
    test("should build complex tree structure", () => {
      const provider = new MockProvider();
      const tree = new ContentTree(provider);

      // Add various content
      tree.add("/index.md", "---\nweight: 1\n---\n# Home");
      tree.add("/docs/index.md", "---\nweight: 2\n---\n# Documentation");
      tree.add(
        "/docs/getting-started.md",
        "---\nweight: 10\n---\n# Getting Started",
      );
      tree.add("/docs/advanced/index.md", "---\nweight: 20\n---\n# Advanced");
      tree.add(
        "/docs/advanced/configuration.md",
        "---\nweight: 30\n---\n# Configuration",
      );
      tree.add(
        "/docs/advanced/deployment.md",
        "---\nweight: 40\n---\n# Deployment",
      );
      tree.add("/api/reference.md", "---\nweight: 100\n---\n# API Reference");

      // Test structure
      const allContent = tree.getContent();
      expect(allContent).toHaveLength(7);

      // Test root level ordering
      const root = tree.getRoot();
      const rootChildren = root.children;
      expect(rootChildren).toHaveLength(3);
      expect(rootChildren[0].name).toBe("index"); // Index files come first
      expect(rootChildren[1].name).toBe("docs");
      expect(rootChildren[2].name).toBe("api");

      // Test docs structure
      const docsNode = tree.getNode("/docs");
      const docsChildren = docsNode?.children || [];
      expect(docsChildren[0].name).toBe("index"); // Index first
      expect(docsChildren[1].name).toBe("getting-started");
      expect(docsChildren[2].name).toBe("advanced");

      // Test advanced structure
      const advancedNode = tree.getNode("/docs/advanced");
      const advancedChildren = advancedNode?.children || [];
      expect(advancedChildren[0].name).toBe("index");
      expect(advancedChildren[1].name).toBe("configuration");
      expect(advancedChildren[2].name).toBe("deployment");
    });

    test("should handle mixed languages correctly", () => {
      const enProvider = new MockProvider();
      const frProvider = new MockProvider();
      const enTree = new ContentTree(enProvider, { defaultLanguage: "en" });
      const frTree = new ContentTree(frProvider, {
        defaultLanguage: "fr",
        language: "fr",
      });

      // Add content to both trees
      const content = [
        { path: "/docs/guide.md", content: "# English Guide" },
        { path: "/docs/guide.fr.md", content: "# Guide Français" },
        { path: "/docs/tutorial.en.md", content: "# English Tutorial" },
        { path: "/docs/tutorial.fr.md", content: "# Tutoriel Français" },
      ];

      content.forEach(({ path, content }) => {
        enTree.add(path, content);
        frTree.add(path, content);
      });

      // English tree should only have English content
      const enContent = enTree.getContent();
      expect(enContent).toHaveLength(2);
      expect(enContent.every((node) => node.language === "en")).toBe(true);

      // French tree should only have French content
      const frContent = frTree.getContent();
      expect(frContent).toHaveLength(2);
      expect(frContent.every((node) => node.language === "fr")).toBe(true);
    });
  });
});
