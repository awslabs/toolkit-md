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
 * @fileoverview Markdown content parsing utilities.
 *
 * Provides functions for parsing markdown content, extracting frontmatter,
 * determining content weight, and generating content hashes for change detection.
 */

import { createHash } from "node:crypto";
import * as matter from "gray-matter";

/**
 * Parsed markdown content with extracted metadata.
 */
export interface ParsedContent {
  /** Parsed frontmatter data as key-value pairs */
  frontmatter: Record<string, unknown>;
  /** Numeric weight for sorting, extracted from frontmatter */
  weight: number;
  /** MD5 hash of the content for change detection */
  hash: string;
  /** The original raw content */
  content: string;
}

/**
 * Parses markdown content and extracts frontmatter and metadata.
 *
 * Uses gray-matter to parse YAML frontmatter from markdown content
 * and extracts weight properties for sorting purposes. Also generates
 * a content hash for change detection.
 *
 * @param content - Raw markdown content with frontmatter
 * @returns ParsedContent object with extracted metadata
 *
 * @example
 * ```typescript
 * const content = `---
 * title: Guide
 * weight: 10
 * ---
 * # Guide Content`;
 *
 * const parsed = parseMarkdownContent(content);
 * // Returns: {
 * //   frontmatter: { title: 'Guide', weight: 10 },
 * //   weight: 10,
 * //   hash: 'abc123...',
 * //   content: '---\ntitle: Guide\nweight: 10\n---\n# Guide Content'
 * // }
 * ```
 */
export function parseMarkdownContent(content: string): ParsedContent {
  const parsed = matter.default(content);
  const weight = determineContentWeight(parsed.data);
  const hash = generateHash(content);

  return {
    frontmatter: parsed.data,
    weight,
    hash,
    content,
  };
}

/**
 * Determines the weight of content based on frontmatter properties.
 *
 * Checks for weight-related properties in the frontmatter and returns
 * a numeric weight for sorting purposes. Prioritizes "weight" over
 * "sidebar_position" and defaults to 999 if neither is found.
 *
 * @param frontmatter - Parsed frontmatter data as key-value pairs
 * @returns Numeric weight for sorting, lower values appear first
 *
 * @example
 * ```typescript
 * determineContentWeight({ weight: 5 }); // Returns: 5
 * determineContentWeight({ sidebar_position: 3 }); // Returns: 3
 * determineContentWeight({ weight: 5, sidebar_position: 10 }); // Returns: 5 (weight takes precedence)
 * determineContentWeight({}); // Returns: 999 (default)
 * ```
 */
export function determineContentWeight(
  frontmatter: Record<string, unknown>,
): number {
  // First check for explicit weight property
  if (frontmatter.weight !== undefined) {
    return Number(frontmatter.weight);
  }

  // Fall back to sidebar_position if weight is not specified
  if (frontmatter.sidebar_position !== undefined) {
    return Number(frontmatter.sidebar_position);
  }

  // Default weight if neither property is found
  return 999;
}

/**
 * Generates an MD5 hash of the provided text.
 *
 * Creates a hexadecimal MD5 hash string from the input text. Used for
 * content change detection and tracking modifications to markdown files.
 *
 * @param text - The text to hash
 * @returns MD5 hash as a hexadecimal string
 *
 * @example
 * ```typescript
 * const hash = generateHash('# Hello World');
 * // Returns: 'a1b2c3d4e5f6...' (32-character hex string)
 * ```
 */
export function generateHash(text: string): string {
  const hash = createHash("md5");
  hash.update(text, "utf8");
  return hash.digest("hex").toString();
}

/**
 * Key used in frontmatter to store the source content hash for translation tracking.
 *
 * This constant defines the frontmatter property name used to track the hash of the
 * source content when managing translations. It helps detect when source content
 * has changed and translations need to be updated.
 */
export const TRANSLATION_SRC_HASH_KEY = "tmdTranslationSourceHash";
export const LEGACY_TRANSLATION_SRC_HASH_KEY = "wsmSourceHash";
