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

/**
 * @fileoverview Markdown tree management system for handling multilingual content.
 *
 * This module provides a comprehensive system for managing markdown files organized in a tree structure
 * with support for multiple languages. It handles parsing frontmatter, organizing content by weight,
 * and providing utilities for content retrieval and manipulation.
 *
 * Key features:
 * - Hierarchical organization of markdown files
 * - Multi-language support with automatic language detection
 * - Frontmatter parsing and weight-based sorting
 * - Content hashing for change detection
 * - Tree traversal and search utilities
 *
 * @example
 * ```typescript
 * const tree = new MarkdownTree('/path/to/content', 'en');
 * const flattenedContent = tree.getFlattenedTree();
 * const englishContent = tree.getContent('en');
 * ```
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as matter from "gray-matter";

/**
 * Represents content for a specific language variant of a markdown file.
 *
 * This interface encapsulates all the information needed to represent a single
 * language version of a markdown document, including its content, metadata,
 * file system location, and content hash for change detection.
 */
export interface LanguageContent {
  /** The raw markdown content including frontmatter */
  content: string;
  /** Parsed frontmatter data as key-value pairs */
  frontmatter: Record<string, unknown>;
  /** Absolute file system path to the markdown file */
  path: string;
  /** MD5 hash of the content for change detection */
  hash: string;
}

/**
 * Represents a node in the markdown content tree structure.
 *
 * Each node can represent either a directory or a markdown file. File nodes contain
 * language-specific content variants, while directory nodes organize the hierarchy.
 * The tree structure supports parent-child relationships and weight-based ordering.
 */
export interface TreeNode {
  /** The base name of the file or directory (without extension or language suffix) */
  name: string;
  /** Absolute file system path to the node */
  path: string;
  /** Whether this node represents a directory (true) or a file (false) */
  isDirectory: boolean;
  /** Numeric weight for sorting, lower values appear first. Index pages get -1 */
  weight: number;
  /** Map of language codes to their corresponding content (empty for directories) */
  languages: Map<string, LanguageContent>;
  /** Child nodes in the tree hierarchy */
  children: TreeNode[];
  /** Reference to the parent node, null for root node */
  parent: TreeNode | null;
}

/**
 * Key used in frontmatter to store the source content hash for translation tracking.
 *
 * This constant defines the frontmatter property name used to track the hash of the
 * source content when managing translations. It helps detect when source content
 * has changed and translations need to be updated.
 */
export const TRANSLATION_SRC_HASH_KEY = "kiteTranslationSourceHash";

/**
 * A tree-based system for managing multilingual markdown content.
 *
 * The MarkdownTree class provides a comprehensive solution for organizing and managing
 * markdown files in a hierarchical structure with support for multiple languages.
 * It automatically parses frontmatter, handles language detection from filenames,
 * and provides utilities for content retrieval and manipulation.
 *
 * Features:
 * - Automatic tree construction from filesystem structure
 * - Multi-language support with language code detection
 * - Weight-based sorting from frontmatter
 * - Content hashing for change detection
 * - Tree traversal and search capabilities
 * - Content addition and updates
 *
 * @example
 * ```typescript
 * // Create a tree from a content directory
 * const tree = new MarkdownTree('/path/to/content', 'en');
 *
 * // Get all content for a specific language
 * const englishContent = tree.getContent('en');
 *
 * // Find a specific node
 * const node = tree.findNodeByPath('/path/to/content/docs/guide');
 *
 * // Add or update content
 * tree.addOrUpdateContent('/path/to/content/new-page', '# New Page\nContent here', 'en');
 * ```
 */
export class MarkdownTree {
  /** The root node of the tree structure */
  private root: TreeNode;
  /** Default language code used when no language is specified in filename */
  private defaultLanguage: string;

  /**
   * Creates a new MarkdownTree instance and builds the tree structure.
   *
   * @param rootPath - Absolute path to the root directory containing markdown files
   * @param defaultLanguage - Default language code to use for files without language suffix (defaults to 'en')
   * @throws {Error} When the root directory does not exist
   *
   * @example
   * ```typescript
   * const tree = new MarkdownTree('/content', 'en');
   * const frenchTree = new MarkdownTree('/content', 'fr');
   * ```
   */
  constructor(rootPath: string, defaultLanguage: string = "en") {
    this.defaultLanguage = defaultLanguage;
    this.root = {
      name: path.basename(rootPath),
      path: rootPath,
      isDirectory: true,
      weight: 0,
      languages: new Map(),
      children: [],
      parent: null,
    };

    this.loadTree(rootPath, this.root);
  }

  /**
   * Extracts the base name and language code from a markdown filename.
   *
   * Parses filenames to separate the base name from the language code.
   * Supports formats like 'page.en.md' (base: 'page', language: 'en')
   * or 'page.md' (base: 'page', language: defaultLanguage).
   *
   * @param fileName - The filename to parse (e.g., 'guide.en.md')
   * @returns Object containing the base name and detected language code
   * @internal
   */
  private extractFileInfo(fileName: string): {
    baseName: string;
    language: string;
  } {
    const extension = path.extname(fileName);
    const nameWithoutExt = fileName.slice(0, -extension.length);

    const parts = nameWithoutExt.split(".");

    if (parts.length > 1) {
      const potentialLang = parts[parts.length - 1];

      return {
        baseName: parts.slice(0, -1).join("."),
        language: potentialLang,
      };
    }

    return {
      baseName: nameWithoutExt,
      language: this.defaultLanguage,
    };
  }

  /**
   * Recursively loads the directory structure and builds the tree.
   *
   * This method scans the filesystem starting from the given directory,
   * creates tree nodes for directories and markdown files, parses frontmatter,
   * groups files by language, and sorts children by weight.
   *
   * @param dirPath - Directory path to scan
   * @param parentNode - Parent tree node to attach children to
   * @throws {Error} When the directory does not exist
   * @internal
   */
  private loadTree(dirPath: string, parentNode: TreeNode): void {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory does not exist - ${dirPath}`);
    }

    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = fs.statSync(itemPath);

      if (stats.isDirectory()) {
        const dirNode: TreeNode = {
          name: item,
          path: itemPath,
          isDirectory: true,
          weight: 0,
          languages: new Map(),
          children: [],
          parent: parentNode,
        };

        this.loadTree(itemPath, dirNode);

        parentNode.children.push(dirNode);
      }
    }

    const markdownFiles: {
      baseName: string;
      language: string;
      path: string;
      content: string;
      parsedData: { frontmatter: Record<string, unknown>; weight: number };
    }[] = [];

    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = fs.statSync(itemPath);

      if (!stats.isDirectory() && path.extname(item).toLowerCase() === ".md") {
        const content = fs.readFileSync(itemPath, "utf-8");
        const parsedData = this.parseMarkdown(content);

        const { baseName, language } = this.extractFileInfo(item);

        markdownFiles.push({
          baseName,
          language,
          path: itemPath,
          content,
          parsedData,
        });
      }
    }

    const groupedFiles = new Map<string, typeof markdownFiles>();

    for (const file of markdownFiles) {
      let fetched = groupedFiles.get(file.baseName);

      if (!fetched) {
        fetched = [];

        groupedFiles.set(file.baseName, fetched);
      }
      fetched.push(file);
    }

    for (const [baseName, files] of groupedFiles.entries()) {
      const minWeight = Math.min(
        ...files.map((file) => file.parsedData.weight || 999),
      );

      const isIndexPage = baseName === "index" || baseName === "_index";

      const fileNode: TreeNode = {
        name: baseName,
        path: path.join(dirPath, baseName),
        isDirectory: false,
        weight: isIndexPage ? -1 : minWeight,
        languages: new Map(),
        children: [],
        parent: parentNode,
      };

      for (const file of files) {
        fileNode.languages.set(file.language, {
          content: file.content,
          frontmatter: file.parsedData.frontmatter,
          path: file.path,
          hash: md5Hash(file.content),
        });
      }

      parentNode.children.push(fileNode);

      if (isIndexPage) {
        parentNode.weight = minWeight;
      }
    }

    this.sortNodeChildren(parentNode);
  }

  /**
   * Parses markdown content and extracts frontmatter data.
   *
   * Uses gray-matter to parse YAML frontmatter from markdown content
   * and extracts the weight property for sorting purposes.
   *
   * @param content - Raw markdown content with frontmatter
   * @returns Object containing parsed frontmatter and extracted weight
   * @internal
   */
  private parseMarkdown(content: string): {
    frontmatter: Record<string, unknown>;
    weight: number;
  } {
    const frontmatter = matter.default(content);

    return {
      frontmatter: frontmatter.data,
      weight:
        frontmatter.data.weight !== undefined
          ? Number(frontmatter.data.weight)
          : 999,
    };
  }

  /**
   * Sorts the children of a tree node by their weight property.
   *
   * Children are sorted in ascending order by weight, with lower weights
   * appearing first. This ensures consistent ordering throughout the tree.
   *
   * @param node - The tree node whose children should be sorted
   * @internal
   */
  private sortNodeChildren(node: TreeNode): void {
    node.children.sort((a, b) => a.weight - b.weight);
  }

  /**
   * Gets the root node of the tree structure.
   *
   * @returns The root TreeNode containing the entire tree hierarchy
   */
  public getTree(): TreeNode {
    return this.root;
  }

  /**
   * Adds new content or updates existing content for a specific language.
   *
   * This method allows adding new language variants to existing nodes or
   * updating the content of existing language variants. It handles file
   * writing, weight updates, and tree re-sorting as needed.
   *
   * @param nodePath - Base path to the content node (without language suffix)
   * @param content - The markdown content to add or update
   * @param language - Language code for the content (defaults to defaultLanguage)
   * @returns Object containing the updated node and language content
   * @throws {Error} When the specified node path is not found
   *
   * @example
   * ```typescript
   * const result = tree.addOrUpdateContent(
   *   '/content/docs/guide',
   *   '# Guide\nThis is the guide content.',
   *   'en'
   * );
   * console.log(result.node.name); // 'guide'
   * console.log(result.languageContent.hash); // MD5 hash of content
   * ```
   */
  public addOrUpdateContent(
    nodePath: string,
    content: string,
    language: string = this.defaultLanguage,
  ): { node: TreeNode; languageContent: LanguageContent } {
    const parsedData = this.parseMarkdown(content);

    const node = this.findNodeByBasePath(nodePath);

    if (node) {
      let languageContent = node.languages.get(language);

      if (!languageContent) {
        const languagePath = `${nodePath}.${language}.md`;
        languageContent = {
          content,
          frontmatter: parsedData.frontmatter,
          path: languagePath,
          hash: md5Hash(content),
        };

        node.languages.set(language, languageContent);

        if ((parsedData.weight || 999) < node.weight) {
          node.weight = parsedData.weight || 999;

          const parentPath = path.dirname(languagePath);
          const parentNode = this.findNodeByPath(parentPath);
          if (parentNode) {
            this.sortNodeChildren(parentNode);
          }
        }

        this.writeContentToFile(languagePath, content);
      } else {
        languageContent.content = content;
        languageContent.frontmatter = parsedData.frontmatter;

        this.writeContentToFile(languageContent.path, content);
      }

      return { node, languageContent };
    } else {
      throw new Error(`Node not found: ${nodePath}`);
    }
  }

  /**
   * Writes content to a file on the filesystem.
   *
   * @param filePath - Absolute path where the content should be written
   * @param content - Content to write to the file
   * @internal
   */
  private writeContentToFile(filePath: string, content: string): void {
    fs.writeFileSync(filePath, content, "utf-8");
  }

  /**
   * Finds a tree node by its exact filesystem path.
   *
   * Searches the tree for a node with the specified path. This method
   * performs an exact match on the node's path property.
   *
   * @param nodePath - Exact filesystem path to search for
   * @returns The matching TreeNode or null if not found
   *
   * @example
   * ```typescript
   * const node = tree.findNodeByPath('/content/docs/guide');
   * if (node) {
   *   console.log(node.name); // 'guide'
   * }
   * ```
   */
  public findNodeByPath(nodePath: string): TreeNode | null {
    if (this.root.path === nodePath) {
      return this.root;
    }

    return this.findNodeByPathRecursive(this.root, nodePath);
  }

  /**
   * Recursively searches for a node by its filesystem path.
   *
   * @param currentNode - Current node being examined in the search
   * @param targetPath - Target filesystem path to find
   * @returns The matching TreeNode or null if not found
   * @internal
   */
  private findNodeByPathRecursive(
    currentNode: TreeNode,
    targetPath: string,
  ): TreeNode | null {
    if (currentNode.path === targetPath) {
      return currentNode;
    }

    for (const child of currentNode.children) {
      const found = this.findNodeByPathRecursive(child, targetPath);
      if (found) {
        return found;
      }
    }

    return null;
  }

  /**
   * Finds a tree node by its base path (without language suffix).
   *
   * Searches for file nodes that match the specified base path. This is useful
   * for finding content nodes when you don't know the exact language-specific filename.
   *
   * @param basePath - Base filesystem path to search for (without language suffix)
   * @returns The matching TreeNode or null if not found
   *
   * @example
   * ```typescript
   * const node = tree.findNodeByBasePath('/content/docs/guide');
   * if (node) {
   *   console.log(node.languages.keys()); // Available languages for this content
   * }
   * ```
   */
  public findNodeByBasePath(basePath: string): TreeNode | null {
    return this.findNodeByBasePathRecursive(this.root, basePath);
  }

  /**
   * Recursively searches for a file node by its base path.
   *
   * @param currentNode - Current node being examined in the search
   * @param targetBasePath - Target base path to find
   * @returns The matching TreeNode or null if not found
   * @internal
   */
  private findNodeByBasePathRecursive(
    currentNode: TreeNode,
    targetBasePath: string,
  ): TreeNode | null {
    if (!currentNode.isDirectory && currentNode.path === targetBasePath) {
      return currentNode;
    }

    for (const child of currentNode.children) {
      const found = this.findNodeByBasePathRecursive(child, targetBasePath);
      if (found) {
        return found;
      }
    }

    return null;
  }

  /**
   * Finds all tree nodes with the specified name.
   *
   * Searches the entire tree for nodes (both files and directories) that have
   * the specified name. This can return multiple results if there are nodes
   * with the same name in different parts of the tree.
   *
   * @param name - The node name to search for
   * @returns Array of TreeNodes with matching names
   *
   * @example
   * ```typescript
   * const indexNodes = tree.findNodesByName('index');
   * console.log(`Found ${indexNodes.length} index pages`);
   * ```
   */
  public findNodesByName(name: string): TreeNode[] {
    const results: TreeNode[] = [];
    this.findNodesByNameRecursive(this.root, name, results);
    return results;
  }

  /**
   * Recursively searches for nodes by name and collects results.
   *
   * @param currentNode - Current node being examined in the search
   * @param targetName - Target name to find
   * @param results - Array to collect matching nodes
   * @internal
   */
  private findNodesByNameRecursive(
    currentNode: TreeNode,
    targetName: string,
    results: TreeNode[],
  ): void {
    if (currentNode.name === targetName) {
      results.push(currentNode);
    }

    for (const child of currentNode.children) {
      this.findNodesByNameRecursive(child, targetName, results);
    }
  }

  /**
   * Gets the sibling file nodes of the specified node.
   *
   * Returns all file nodes (not directories) that share the same parent
   * as the given node. This is useful for navigation and related content discovery.
   *
   * @param node - The node whose siblings to find
   * @returns Array of sibling TreeNodes (files only, not directories)
   *
   * @example
   * ```typescript
   * const node = tree.findNodeByPath('/content/docs/guide');
   * if (node) {
   *   const siblings = tree.getSiblings(node);
   *   console.log(`Found ${siblings.length} sibling pages`);
   * }
   * ```
   */
  public getSiblings(node: TreeNode): TreeNode[] {
    const parent = node.parent;

    if (!parent) {
      return [];
    }

    return parent.children.filter((e) => !e.isDirectory);
  }

  /**
   * Gets the available language codes for a specific node.
   *
   * Returns an array of language codes that have content available
   * for the specified node. Only applies to file nodes.
   *
   * @param node - The node to check for available languages
   * @returns Array of language codes available for this node
   *
   * @example
   * ```typescript
   * const node = tree.findNodeByPath('/content/docs/guide');
   * if (node) {
   *   const languages = tree.getAvailableLanguages(node);
   *   console.log('Available languages:', languages); // ['en', 'fr', 'es']
   * }
   * ```
   */
  public getAvailableLanguages(node: TreeNode): string[] {
    return Array.from(node.languages.keys());
  }

  /**
   * Prints the entire tree structure to the console.
   *
   * Outputs a hierarchical representation of the tree showing directories,
   * files, available languages, and weights. Useful for debugging and
   * understanding the tree structure.
   *
   * @example
   * ```typescript
   * tree.printTree();
   * // Output:
   * // [DIR] content (weight: 0)
   * //   [FILE] index [en] (weight: -1)
   * //   [DIR] docs (weight: 0)
   * //     [FILE] guide [en, fr] (weight: 10)
   * ```
   */
  public printTree(): void {
    this.printNodeRecursive(this.root, 0);
  }

  /**
   * Recursively prints tree nodes with proper indentation.
   *
   * @param node - Current node to print
   * @param level - Current indentation level
   * @internal
   */
  private printNodeRecursive(node: TreeNode, level: number): void {
    const indent = "  ".repeat(level);
    const nodeType = node.isDirectory ? "[DIR]" : "[FILE]";
    const languages = node.isDirectory
      ? ""
      : `[${Array.from(node.languages.keys()).join(", ")}]`;

    console.log(
      `${indent}${nodeType} ${node.name} ${languages} (weight: ${node.weight})`,
    );

    for (const child of node.children) {
      this.printNodeRecursive(child, level + 1);
    }
  }

  /**
   * Gets a flattened array of all file nodes in the tree.
   *
   * Traverses the entire tree and returns all file nodes (not directories)
   * in a flat array. This is useful for operations that need to process
   * all content files without regard to their hierarchical structure.
   *
   * @returns Array of all file TreeNodes in the tree
   *
   * @example
   * ```typescript
   * const allFiles = tree.getFlattenedTree();
   * console.log(`Total files: ${allFiles.length}`);
   * allFiles.forEach(file => {
   *   console.log(`${file.name}: ${file.languages.size} languages`);
   * });
   * ```
   */
  public getFlattenedTree(): TreeNode[] {
    const result: TreeNode[] = [];
    this.flattenTreeRecursive(this.root, result);
    return result;
  }

  /**
   * Recursively collects file nodes into a flat array.
   *
   * @param node - Current node being processed
   * @param result - Array to collect file nodes
   * @internal
   */
  private flattenTreeRecursive(node: TreeNode, result: TreeNode[]): void {
    if (!node.isDirectory) {
      result.push(node);
    }

    for (const child of node.children) {
      this.flattenTreeRecursive(child, result);
    }
  }

  /**
   * Gets all content for a specific language from the entire tree.
   *
   * Retrieves all LanguageContent objects for the specified language
   * from all file nodes in the tree. This is useful for operations
   * that need to process all content in a specific language.
   *
   * @param language - The language code to retrieve content for
   * @returns Array of LanguageContent objects for the specified language
   *
   * @example
   * ```typescript
   * const englishContent = tree.getContent('en');
   * console.log(`Found ${englishContent.length} English pages`);
   *
   * const frenchContent = tree.getContent('fr');
   * frenchContent.forEach(content => {
   *   console.log(`${content.path}: ${content.hash}`);
   * });
   * ```
   */
  public getContent(language: string) {
    const nodes = this.getFlattenedTree();

    const contentList: LanguageContent[] = [];

    for (const node of nodes) {
      const content = node.languages.get(language);

      if (content) {
        contentList.push(content);
      }
    }

    return contentList;
  }
}

/**
 * Utility function to create a MarkdownTree and get a flattened array of file nodes.
 *
 * This is a convenience function that creates a MarkdownTree instance and immediately
 * returns a flattened array of all file nodes. Useful for simple operations that
 * don't need the full tree structure.
 *
 * @param rootPath - Absolute path to the root directory containing markdown files
 * @param defaultLanguage - Default language code to use for files without language suffix (defaults to 'en')
 * @returns Array of all file TreeNodes in the tree
 *
 * @example
 * ```typescript
 * const allFiles = getFlattenedTree('/content', 'en');
 * console.log(`Found ${allFiles.length} content files`);
 * ```
 */
export function getFlattenedTree(
  rootPath: string,
  defaultLanguage: string = "en",
) {
  const tree = new MarkdownTree(rootPath, defaultLanguage);
  return tree.getFlattenedTree();
}

/**
 * Generates an MD5 hash of the provided text.
 *
 * Creates a hexadecimal MD5 hash string from the input text. Used internally
 * for content change detection and tracking modifications to markdown files.
 *
 * @param text - The text to hash
 * @returns MD5 hash as a hexadecimal string
 * @internal
 */
function md5Hash(text: string) {
  const hash = createHash("md5");
  hash.update(text, "utf8");
  return hash.digest("hex").toString();
}
