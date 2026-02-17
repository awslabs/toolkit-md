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
 * @fileoverview Content node interface for the tree structure.
 *
 * Represents a single node in the content tree, which can be either a directory
 * or a content file. This is a simplified, clean interface focused on the
 * essential properties needed for tree operations.
 */

/**
 * Represents a node in the content tree structure.
 *
 * Each node can represent either a directory or a content file. The tree structure
 * supports parent-child relationships and weight-based ordering for content organization.
 */
export interface ContentNode {
  /** The base name of the file or directory (without extension or language suffix) */
  name: string;
  /** Logical path in the tree structure */
  path: string;
  /** Whether this node represents a directory (true) or a file (false) */
  isDirectory: boolean;
  /** Numeric weight for sorting, lower values appear first. Index pages get -1 */
  weight: number;
  /** Child nodes in the tree hierarchy */
  children: ContentNode[];
  /** Reference to the parent node, null for root node */
  parent: ContentNode | null;

  // Content properties (null for directories)
  /** The raw markdown content including frontmatter (null for directories) */
  content: string | null;
  /** Parsed frontmatter data as key-value pairs (null for directories) */
  frontmatter: Record<string, unknown>;
  /** Language code for this content (null for directories) */
  language: string | null;
  /** Original file path where this content was loaded from (null for directories) */
  filePath: string;
  /** MD5 hash of the content for change detection (null for directories) */
  hash: string | null;
  /** Image references extracted from the content (empty for directories) */
  images: ImageReference[];
  /** Fenced code blocks extracted from the content (empty for directories) */
  codeBlocks: CodeBlockReference[];
}

/**
 * Represents a local image reference found in markdown content.
 */
export interface ImageReference {
  /** The relative or absolute path to the image file */
  path: string;
  /** The alt text for the image, if provided */
  alt: string | null;
  /** The 1-based line number where the image appears in the source file */
  line: number;
  /** Whether the image is a remote URL (http/https) */
  remote: boolean;
}

/**
 * Represents a fenced code block found in markdown content.
 */
export interface CodeBlockReference {
  /** The language identifier from the code fence, if provided */
  language: string | null;
  /** The code content inside the block */
  code: string;
  /** The 1-based line number where the code block starts in the source file */
  line: number;
}
