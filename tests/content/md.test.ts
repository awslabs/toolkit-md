import mock from "mock-fs";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { MarkdownTree } from "../../src/content/index.js";

describe("MarkdownTree", () => {
  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    mock.restore();
  });

  describe("getTree", () => {
    test("should return empty tree when directory is empty", () => {
      const rootPath = "/test-root";
      mock({
        [rootPath]: {},
      });

      const tree = new MarkdownTree(rootPath);
      const result = tree.getTree();

      expect(result).toEqual({
        name: "test-root",
        path: rootPath,
        isDirectory: true,
        weight: 0,
        languages: new Map(),
        children: [],
        parent: null,
      });
    });

    test("should build tree with single markdown file", () => {
      const rootPath = "/test-root";
      mock({
        [rootPath]: {
          "test.md": "# Test\nThis is a test file.",
        },
      });

      const tree = new MarkdownTree(rootPath);
      const flattenedTree = tree.getFlattenedTree();

      expect(flattenedTree.length).toBe(1);
      expect(flattenedTree[0].name).toBe("test");
      expect(flattenedTree[0].isDirectory).toBe(false);
      expect(flattenedTree[0].languages.size).toBe(1);
      expect(flattenedTree[0].languages.has("en")).toBe(true);

      const content = flattenedTree[0].languages.get("en");
      expect(content).toBeDefined();
      expect(content?.content).toBe("# Test\nThis is a test file.");
    });

    test("should build tree with multiple markdown files in different languages", () => {
      const rootPath = "/test-root";
      mock({
        [rootPath]: {
          "test.en.md": "# Test\nThis is a test file in English.",
          "test.fr.md": "# Test\nCeci est un fichier de test en français.",
        },
      });

      const tree = new MarkdownTree(rootPath);
      const flattenedTree = tree.getFlattenedTree();

      expect(flattenedTree.length).toBe(1);
      expect(flattenedTree[0].name).toBe("test");
      expect(flattenedTree[0].isDirectory).toBe(false);
      expect(flattenedTree[0].languages.size).toBe(2);
      expect(flattenedTree[0].languages.has("en")).toBe(true);
      expect(flattenedTree[0].languages.has("fr")).toBe(true);

      const enContent = flattenedTree[0].languages.get("en");
      expect(enContent).toBeDefined();
      expect(enContent?.content).toBe(
        "# Test\nThis is a test file in English.",
      );

      const frContent = flattenedTree[0].languages.get("fr");
      expect(frContent).toBeDefined();
      expect(frContent?.content).toBe(
        "# Test\nCeci est un fichier de test en français.",
      );

      expect(tree.getAvailableLanguages(flattenedTree[0])).toStrictEqual([
        "en",
        "fr",
      ]);
    });

    test("should build tree with nested directories", () => {
      const rootPath = "/test-root";
      mock({
        [rootPath]: {
          dir1: {
            "test1.md": "# Test 1\nThis is test file 1.",
          },
          dir2: {
            "test2.md": "# Test 2\nThis is test file 2.",
          },
        },
      });

      const tree = new MarkdownTree(rootPath);
      const flattenedTree = tree.getFlattenedTree();

      expect(flattenedTree.length).toBe(2);

      const test1Node = flattenedTree.find((node) => node.name === "test1");
      const test2Node = flattenedTree.find((node) => node.name === "test2");

      expect(test1Node).toBeDefined();
      expect(test1Node?.isDirectory).toBe(false);
      expect(test1Node?.parent?.name).toBe("dir1");

      expect(test2Node).toBeDefined();
      expect(test2Node?.isDirectory).toBe(false);
      expect(test2Node?.parent?.name).toBe("dir2");
    });

    test("should handle frontmatter and weight correctly", () => {
      const rootPath = "/test-root";
      mock({
        [rootPath]: {
          "high.md": "---\nweight: 10\n---\n# High Priority",
          "low.md": "---\nweight: 100\n---\n# Low Priority",
          "medium.md": "---\nweight: 50\n---\n# Medium Priority",
        },
      });

      const tree = new MarkdownTree(rootPath);
      const flattenedTree = tree.getFlattenedTree();

      expect(flattenedTree.length).toBe(3);

      const highNode = flattenedTree[0];
      const mediumNode = flattenedTree[1];
      const lowNode = flattenedTree[2];

      expect(highNode).toBeDefined();
      expect(highNode?.weight).toBe(10);

      expect(mediumNode).toBeDefined();
      expect(mediumNode?.weight).toBe(50);

      expect(lowNode).toBeDefined();
      expect(lowNode?.weight).toBe(100);
    });

    test("should handle index files correctly", () => {
      const rootPath = "/test-root";
      mock({
        [rootPath]: {
          "index.md": "---\nweight: 5\n---\n# Index Page",
          "other.md": "# Other Page",
        },
      });

      const tree = new MarkdownTree(rootPath);
      const flattenedTree = tree.getFlattenedTree();
      const rootNode = tree.getTree();

      expect(flattenedTree.length).toBe(2);

      const indexNode = flattenedTree.find((node) => node.name === "index");
      const otherNode = flattenedTree.find((node) => node.name === "other");

      expect(indexNode).toBeDefined();
      expect(indexNode?.weight).toBe(-1);
      expect(rootNode.weight).toBe(5);

      expect(otherNode).toBeDefined();
    });

    test("should handle _index files correctly", () => {
      const rootPath = "/test-root";
      mock({
        [rootPath]: {
          "_index.md": "---\nweight: 5\n---\n# Index Page",
          "other.md": "# Other Page",
        },
      });

      const tree = new MarkdownTree(rootPath);
      const flattenedTree = tree.getFlattenedTree();
      const rootNode = tree.getTree();

      expect(flattenedTree.length).toBe(2);

      const indexNode = flattenedTree.find((node) => node.name === "_index");
      const otherNode = flattenedTree.find((node) => node.name === "other");

      expect(indexNode).toBeDefined();
      expect(indexNode?.weight).toBe(-1);
      expect(rootNode.weight).toBe(5);

      expect(otherNode).toBeDefined();
    });

    test("should throw error when directory does not exist", () => {
      const rootPath = "/nonexistent";
      mock({});

      expect(() => new MarkdownTree(rootPath)).toThrow(
        "Directory does not exist - /nonexistent",
      );
    });

    test("should use custom default language when specified", () => {
      const rootPath = "/test-root";
      const defaultLanguage = "fr";

      mock({
        [rootPath]: {
          "test.md": "# Test\nThis is a test file.",
        },
      });

      const tree = new MarkdownTree(rootPath, defaultLanguage);
      const flattenedTree = tree.getFlattenedTree();

      expect(flattenedTree.length).toBe(1);
      expect(flattenedTree[0].name).toBe("test");
      expect(flattenedTree[0].isDirectory).toBe(false);
      expect(flattenedTree[0].languages.size).toBe(1);
      expect(flattenedTree[0].languages.has("fr")).toBe(true);
      expect(flattenedTree[0].languages.has("en")).toBe(false);

      const content = flattenedTree[0].languages.get("fr");
      expect(content).toBeDefined();
      expect(content?.content).toBe("# Test\nThis is a test file.");

      expect(tree.getAvailableLanguages(flattenedTree[0])).toStrictEqual([
        "fr",
      ]);
    });
  });
});
