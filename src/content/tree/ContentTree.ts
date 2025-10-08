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
 * @fileoverview Core content tree implementation.
 *
 * Provides a clean, focused tree data structure for managing markdown content
 * with support for incremental building via the add() method. Separates tree
 * management from filesystem operations for better testability and flexibility.
 */

import * as path from "node:path";
import type { ContentProvider } from "../providers/ContentProvider.js";
import { extractFileInfo, type FileInfo } from "../utils/languageUtils.js";
import { parseMarkdownContent } from "../utils/markdownUtils.js";
import type { ContentNode } from "./ContentNode.js";

/**
 * A tree data structure for managing markdown content.
 *
 * Key features:
 * - Incremental tree building with the add() method
 * - Language filtering based on filename detection
 * - Automatic intermediate directory node creation
 * - Weight-based sorting and organization
 * - Optional persistence through ContentProvider
 *
 * @example
 * ```typescript
 * // Create a tree for English content
 * const tree = new ContentTree('en');
 *
 * // Add content incrementally
 * tree.add('/docs/guide.md', '---\nweight: 10\n---\n# Guide');
 * tree.add('/docs/tutorial.fr.md', '# Tutorial FR'); // ignored (wrong language)
 * tree.add('/docs/advanced/secrets.md', '# Secrets');
 *
 * // Query the tree
 * const allContent = tree.getContent();
 * const guideNode = tree.getNode('/docs/guide');
 * ```
 */
export class ContentTree {
  private root: ContentNode;
  private nodeMap = new Map<string, ContentNode>();

  private language: string;
  private defaultLanguage: string;
  private includeLanguageSuffix: boolean;

  /**
   * Creates a new ContentTree instance.
   *
   * @param defaultLanguage - Default language code for files without language suffix
   * @param provider - Optional content provider for persistence operations
   *
   * @example
   * ```typescript
   * // Basic tree
   * const tree = new ContentTree('en');
   *
   * // Tree with filesystem persistence
   * const provider = new FileSystemProvider('/content');
   * const tree = new ContentTree('en', provider);
   * ```
   */
  constructor(
    private readonly provider: ContentProvider,
    private options?: {
      defaultLanguage?: string;
      language?: string;
      includeLanguageSuffix?: boolean;
      cwd?: string;
    },
  ) {
    this.defaultLanguage = options?.defaultLanguage || "en";
    this.language = options?.language || "en";
    this.includeLanguageSuffix = options?.includeLanguageSuffix ?? true;

    this.root = {
      name: ".",
      path: "",
      isDirectory: true,
      weight: 0,
      children: [],
      parent: null,
      content: null,
      frontmatter: {},
      language: null,
      filePath: "/",
      hash: null,
    };
    this.nodeMap.set("", this.root);
  }

  /**
   * Adds content to the tree, creating intermediate nodes as needed.
   *
   * This is the core method that builds the tree incrementally. It:
   * 1. Extracts language information from the file path
   * 2. Filters content based on the tree's target language
   * 3. Creates intermediate directory nodes as needed
   * 4. Parses content and creates the content node
   * 5. Maintains weight-based sorting
   * 6. Optionally persists through the provider
   *
   * @param filePath - File path for the content (e.g., '/docs/guide.fr.md')
   * @param content - Raw markdown content with frontmatter
   * @returns The created content node, or null if filtered out
   *
   * @example
   * ```typescript
   * // Add English content (will be included)
   * const node = tree.add('/docs/guide.md', '---\nweight: 5\n---\n# Guide');
   *
   * // Add French content to English tree (will be filtered out)
   * const filtered = tree.add('/docs/guide.fr.md', '# Guide FR'); // returns null
   *
   * // Add content with automatic directory creation
   * tree.add('/docs/advanced/secrets/managing.md', '# Managing Secrets');
   * ```
   */
  add(filePath: string, content: string) {
    // Extract language information from the file path
    const fileInfo = extractFileInfo(filePath, this.defaultLanguage);

    // Filter by target language - only add content that matches
    if (fileInfo.language !== this.language) {
      return null;
    }

    return this.doAdd(fileInfo, content);
  }

  forceAdd(filePath: string, content: string) {
    // Extract language information from the file path
    const fileInfo = extractFileInfo(filePath, this.defaultLanguage);

    return this.doAdd(fileInfo, content);
  }

  /**
   * Creates a new content node and persists it through the provider.
   *
   * This method creates a new content file in the tree and immediately
   * persists it to storage through the content provider. The file path
   * is constructed by appending the appropriate language suffix and
   * file extension to the logical path.
   *
   * @param logicalPath - Logical path for the new content (e.g., '/docs/guide')
   * @param content - Raw markdown content with frontmatter
   * @returns Promise that resolves to the created content node
   *
   * @example
   * ```typescript
   * // Create new content file
   * const node = await tree.create('/docs/new-guide', '---\nweight: 15\n---\n# New Guide');
   * console.log(`Created: ${node.name} at ${node.filePath}`);
   * ```
   */
  async create(logicalPath: string, content: string) {
    const filePath = `${logicalPath}${this.includeLanguageSuffix ? `.${this.language}` : ""}.md`;

    // Extract language information from the file path
    const fileInfo = extractFileInfo(filePath, this.defaultLanguage);

    const node = this.doAdd(fileInfo, content);

    await this.provider.updateContent(node.filePath, content);

    return node;
  }

  /**
   * Internal method that performs the actual node creation and tree insertion.
   *
   * This method handles the core logic of creating a content node from
   * parsed file information and content, ensuring directory structure
   * exists, and inserting the node into the appropriate location in the tree.
   *
   * @param fileInfo - Extracted file information including language and paths
   * @param content - Raw markdown content to parse and store
   * @returns The created content node
   * @internal
   */
  private doAdd(fileInfo: FileInfo, content: string) {
    // Parse the content to extract metadata
    const parsed = parseMarkdownContent(content);

    // Create the logical path for the tree (directory + base name)
    const logicalPath = path.join(fileInfo.directory, fileInfo.baseName);

    // Normalize directory path - handle root directory case
    let normalizedDirectory = path.normalize(fileInfo.directory);
    if (normalizedDirectory === "/" || normalizedDirectory === ".") {
      normalizedDirectory = "";
    }

    // Ensure all intermediate directory nodes exist
    this.ensureDirectoryPath(normalizedDirectory);

    // Determine weight - index files get special treatment
    const weight = fileInfo.isIndexFile ? -1 : parsed.weight;

    // Create the content node
    const contentNode: ContentNode = {
      name: fileInfo.baseName,
      path: logicalPath,
      isDirectory: false,
      weight,
      children: [],
      parent: null, // Will be set when added to parent
      content: parsed.content,
      frontmatter: parsed.frontmatter,
      language: fileInfo.language,
      filePath: fileInfo.filePath,
      hash: parsed.hash,
    };

    // Add to the appropriate parent directory
    const parentNode = this.nodeMap.get(normalizedDirectory);

    if (parentNode) {
      contentNode.parent = parentNode;
      parentNode.children.push(contentNode);
      this.sortChildren(parentNode);

      // If this is an index file, update the parent's weight
      if (fileInfo.isIndexFile && parsed.weight < parentNode.weight) {
        parentNode.weight = parsed.weight;
      }
    }

    // Store in the node map for quick lookup
    this.nodeMap.set(logicalPath, contentNode);

    return contentNode;
  }

  /**
   * Ensures all directory nodes exist for the given path.
   *
   * Creates intermediate directory nodes as needed, building up the
   * tree structure to support the target path.
   *
   * @param directoryPath - Directory path to ensure exists
   * @internal
   */
  private ensureDirectoryPath(directoryPath: string): void {
    // Handle empty path (root directory)
    if (directoryPath === "" || directoryPath === ".") {
      return;
    }

    // Normalize the path
    let normalizedPath = path.normalize(directoryPath);

    // Convert root path variants to empty string to match our root node
    if (normalizedPath === "/" || normalizedPath === ".") {
      normalizedPath = "";
    }

    // If this path already exists, we're done
    if (this.nodeMap.has(normalizedPath)) {
      return;
    }

    // Get parent path and normalize it
    let parentPath = path.dirname(normalizedPath);
    if (
      parentPath === "/" ||
      parentPath === "." ||
      parentPath === normalizedPath
    ) {
      parentPath = "";
    }

    const dirName = path.basename(normalizedPath);

    // Recursively ensure parent exists
    this.ensureDirectoryPath(parentPath);

    // Create this directory node
    const dirNode: ContentNode = {
      name: dirName,
      path: normalizedPath,
      isDirectory: true,
      weight: 999, // Default weight for directories
      children: [],
      parent: null, // Will be set when added to parent
      content: null,
      frontmatter: {},
      language: null,
      filePath: normalizedPath,
      hash: null,
    };

    // Add to parent
    const parentNode = this.nodeMap.get(parentPath);
    if (parentNode) {
      dirNode.parent = parentNode;
      parentNode.children.push(dirNode);
      this.sortChildren(parentNode);
    }

    // Store in node map
    this.nodeMap.set(normalizedPath, dirNode);
  }

  /**
   * Sorts the children of a node by their weight property.
   *
   * @param node - Node whose children should be sorted
   * @internal
   */
  private sortChildren(node: ContentNode): void {
    node.children.sort((a, b) => a.weight - b.weight);
  }

  /**
   * Gets a node by its logical path.
   *
   * @param nodePath - Logical path to the node (e.g., '/docs/guide')
   * @returns The node if found, null otherwise
   *
   * @example
   * ```typescript
   * const node = tree.getNode('/docs/guide');
   * if (node) {
   *   console.log(`Found: ${node.name}`);
   * }
   * ```
   */
  getNode(nodePath: string): ContentNode | null {
    return this.nodeMap.get(nodePath) || null;
  }

  /**
   * Gets all nodes in the tree.
   *
   * @returns Array of all nodes (directories and content)
   *
   * @example
   * ```typescript
   * const allNodes = tree.getNodes();
   * console.log(`Tree contains ${allNodes.length} nodes`);
   * ```
   */
  getNodes(): ContentNode[] {
    return Array.from(this.nodeMap.values());
  }

  /**
   * Gets all sibling content nodes for a given node.
   *
   * Returns all content files (not directories) that share the same
   * parent as the given node. If the node has no parent (root node),
   * returns an empty array.
   *
   * @param node - Node to find siblings for
   * @returns Array of sibling content nodes (directories excluded)
   *
   * @example
   * ```typescript
   * const node = tree.getNode('/docs/guide');
   * if (node) {
   *   const siblings = tree.getSiblings(node);
   *   console.log(`Found ${siblings.length} sibling files`);
   * }
   * ```
   */
  public getSiblings(node: ContentNode): ContentNode[] {
    const parent = node.parent;

    if (!parent) {
      return [];
    }

    return parent.children.filter((e) => !e.isDirectory);
  }

  /**
   * Gets all content nodes (files only, not directories).
   *
   * @returns Array of content nodes with actual content
   *
   * @example
   * ```typescript
   * const content = tree.getContent();
   * content.forEach(node => {
   *   console.log(`${node.name}: ${node.content?.length} characters`);
   * });
   * ```
   */
  getContent(): ContentNode[] {
    return Array.from(this.nodeMap.values()).filter(
      (node) => !node.isDirectory && node.content !== null,
    );
  }

  /**
   * Gets a flattened array of content files in weight order by traversing the tree.
   *
   * Traverses the tree structure recursively, respecting the weight-based ordering
   * at each level, and returns only content files (not directories) in a flat array.
   * This maintains the hierarchical weight-based ordering while providing a linear
   * representation of the content.
   *
   * @param startAt - Optional path to start traversal from (defaults to root)
   * @returns Array of content files in weight-ordered traversal order
   *
   * @example
   * ```typescript
   * const flattenedFiles = tree.getFlattenedTree();
   * console.log(`Tree contains ${flattenedFiles.length} content files`);
   *
   * // Start from a specific subtree
   * const docsFiles = tree.getFlattenedTree('/docs');
   * ```
   */
  getFlattenedTree(startAt?: string): ContentNode[] {
    const startNode = startAt ? this.getNode(startAt) : this.root;

    if (!startNode) {
      throw new Error(`Node not found: ${startAt}`);
    }

    const result: ContentNode[] = [];
    this.flattenTreeRecursive(startNode, result);
    return result;
  }

  /**
   * Recursively flattens content files in weight order.
   *
   * @param node - Current node being processed
   * @param result - Array to collect flattened content files
   * @internal
   */
  private flattenTreeRecursive(node: ContentNode, result: ContentNode[]): void {
    // Add the current node to the result only if it's a content file (not a directory)
    if (!node.isDirectory) {
      result.push(node);
    }

    // Recursively process children in their weight-sorted order
    // (children are already sorted by weight due to sortChildren calls)
    for (const child of node.children) {
      this.flattenTreeRecursive(child, result);
    }
  }

  /**
   * Gets the root node of the tree.
   *
   * @returns The root node containing the entire tree structure
   */
  getRoot(): ContentNode {
    return this.root;
  }

  /**
   * Updates the content of an existing node.
   *
   * @param node - Node to update
   * @param newContent - New content to set
   * @returns Promise that resolves when update is complete
   *
   * @example
   * ```typescript
   * const node = tree.getNode('/docs/guide');
   * if (node) {
   *   await tree.updateContent(node, '# Updated Guide\nNew content here');
   * }
   * ```
   */
  async updateContent(node: ContentNode, newContent: string): Promise<void> {
    const parsed = parseMarkdownContent(newContent);

    node.content = parsed.content;
    node.frontmatter = parsed.frontmatter;
    node.hash = parsed.hash;

    // Update weight if it changed
    const newWeight = parsed.weight;
    if (newWeight !== node.weight) {
      node.weight = newWeight;
      if (node.parent) {
        this.sortChildren(node.parent);
      }
    }

    if (node.filePath) {
      await this.provider.updateContent(node.filePath, newContent);
    }
  }

  /**
   * Gets a visual string representation of the tree structure.
   *
   * Recursively builds a tree map showing the hierarchical structure
   * of all nodes in the tree, with proper indentation and tree-drawing
   * characters. Only shows content files with their titles from frontmatter.
   *
   * @returns String representation of the tree structure
   *
   * @example
   * ```typescript
   * const treeMap = tree.getTreeMap();
   * console.log(treeMap);
   * // Output:
   * // └── docs
   * //     ├── guide.md (title: User Guide)
   * //     └── advanced
   * //         └── secrets.md (title: Managing Secrets)
   * ```
   */
  public getTreeMap(): string {
    return this.buildTreeMap(this.root, true);
  }

  /**
   * Recursively builds the visual tree representation.
   *
   * Creates a tree-like string representation with proper indentation
   * and tree-drawing characters (├── and └──) to show the hierarchical
   * structure of nodes.
   *
   * @param node - Current node being processed
   * @param isLast - Whether this node is the last child of its parent
   * @param indent - Current indentation string for proper alignment
   * @returns String representation of this node and its subtree
   * @internal
   */
  private buildTreeMap(
    node: ContentNode,
    isLast: boolean,
    indent: string = "",
  ): string {
    const prefix = `${indent}${isLast ? "└── " : "├── "}`;

    if (!node.isDirectory) {
      if (node.content) {
        return `${prefix}${path.basename(node.filePath || "")} (title: ${node.frontmatter?.title || ""})\n`;
      }

      return "";
    }

    let output = "";

    if (node.children.length > 0) {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];

        const isLastChild = i === node.children.length - 1;
        const childIndent = `${indent}${isLast ? " " : "│"}   `;

        output += this.buildTreeMap(child, isLastChild, childIndent);
      }

      if (output.length > 0) {
        output = `${prefix}${node.name}\n${output}`;
      }
    }

    return output;
  }

  /**
   * Deletes a node by its logical path.
   *
   * Removes the node from the tree structure and deletes the corresponding
   * file through the content provider. If the node is a directory, it will
   * only be deleted if it's empty (has no children).
   *
   * @param logicalPath - Logical path to the node to delete (e.g., '/docs/guide')
   * @returns Promise that resolves to true if the node was deleted, false if not found
   * @throws Error if attempting to delete a non-empty directory
   *
   * @example
   * ```typescript
   * // Delete a content file
   * const deleted = await tree.delete('/docs/guide');
   * if (deleted) {
   *   console.log('Guide deleted successfully');
   * }
   *
   * // Attempting to delete a non-empty directory will throw an error
   * try {
   *   await tree.delete('/docs'); // Has children
   * } catch (error) {
   *   console.error('Cannot delete non-empty directory');
   * }
   * ```
   */
  async delete(logicalPath: string): Promise<boolean> {
    const node = this.nodeMap.get(logicalPath);

    if (!node) {
      return false;
    }

    // Prevent deletion of root node
    if (node === this.root) {
      throw new Error("Cannot delete root node");
    }

    // For directories, only allow deletion if empty
    if (node.isDirectory && node.children.length > 0) {
      throw new Error(`Cannot delete non-empty directory: ${logicalPath}`);
    }

    // Remove from parent's children array
    if (node.parent) {
      const childIndex = node.parent.children.indexOf(node);
      if (childIndex !== -1) {
        node.parent.children.splice(childIndex, 1);
      }
    }

    // Remove from node map
    this.nodeMap.delete(logicalPath);

    // Delete the file through the provider (only for content files)
    if (!node.isDirectory && node.filePath) {
      await this.provider.deleteContent(node.filePath);
    }

    // Clean up parent reference
    node.parent = null;

    return true;
  }

  /**
   * Prints the tree structure to the console.
   *
   * Useful for debugging and understanding the tree structure.
   *
   * @example
   * ```typescript
   * tree.printTree();
   * // Output:
   * // [DIR]  (weight: 0)
   * //   [DIR] docs (weight: 999)
   * //     [FILE] guide [en] (weight: 10)
   * //     [DIR] advanced (weight: 999)
   * //       [FILE] secrets [en] (weight: 20)
   * ```
   */
  printTree(): void {
    this.printNodeRecursive(this.root, 0);
  }

  /**
   * Recursively prints tree nodes with proper indentation.
   *
   * @param node - Current node to print
   * @param level - Current indentation level
   * @internal
   */
  private printNodeRecursive(node: ContentNode, level: number): void {
    const indent = "  ".repeat(level);
    const nodeType = node.isDirectory ? "[DIR]" : "[FILE]";
    const languageInfo = node.language ? `[${node.language}]` : "";

    console.log(
      `${indent}${nodeType} ${node.name} ${languageInfo} (weight: ${node.weight})`,
    );

    for (const child of node.children) {
      this.printNodeRecursive(child, level + 1);
    }
  }
}
