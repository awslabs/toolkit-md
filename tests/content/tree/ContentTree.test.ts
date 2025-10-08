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
