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
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import * as matter from "gray-matter";
import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type {
  CodeBlockReference,
  ImageReference,
} from "../tree/ContentNode.js";

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

export interface MarkdownElements {
  images: ImageReference[];
  codeBlocks: CodeBlockReference[];
  title: string | null;
}

function extractTextFromChildren(children?: unknown[]): string {
  if (!Array.isArray(children)) return "";
  return children
    .filter(
      (c): c is { type: string; value?: string; children?: unknown[] } =>
        typeof c === "object" && c !== null,
    )
    .map((c) =>
      c.type === "text" && c.value
        ? c.value
        : extractTextFromChildren(c.children),
    )
    .join("");
}

export function extractMarkdownElements(content: string): MarkdownElements {
  const tree = unified().use(remarkParse).use(remarkDirective).parse(content);
  const seenImages = new Set<string>();
  const images: ImageReference[] = [];
  const codeBlocks: CodeBlockReference[] = [];
  let title: string | null = null;

  function visit(node: {
    type: string;
    depth?: number;
    name?: string;
    url?: string;
    alt?: string;
    lang?: string;
    value?: string;
    attributes?: Record<string, string>;
    position?: { start: { line: number } };
    children?: unknown[];
  }): void {
    if (node.type === "heading" && node.depth === 1 && title === null) {
      title = extractTextFromChildren(node.children) || null;
    }
    if (node.type === "image" && node.url) {
      if (!seenImages.has(node.url)) {
        seenImages.add(node.url);
        images.push({
          path: node.url,
          alt: node.alt || null,
          line: node.position?.start.line ?? 0,
          remote: isRemoteUrl(node.url),
        });
      }
    }

    if (
      (node.type === "leafDirective" ||
        node.type === "textDirective" ||
        node.type === "containerDirective") &&
      node.name === "image"
    ) {
      const src = node.attributes?.src;
      if (src && !seenImages.has(src)) {
        seenImages.add(src);
        const alt = extractTextFromChildren(node.children) || null;
        images.push({
          path: src,
          alt,
          line: node.position?.start.line ?? 0,
          remote: isRemoteUrl(src),
        });
      }
    }

    if (node.type === "html" && typeof node.value === "string") {
      const htmlImageRegex =
        /<img[^>]+src=["']([^"']+)["'](?:[^>]+alt=["']([^"']*)["'])?/g;
      const altFirstRegex =
        /<img[^>]+alt=["']([^"']*)["'](?:[^>]+src=["']([^"']+)["'])/g;
      const matched = new Set<string>();

      for (const regex of [htmlImageRegex, altFirstRegex]) {
        let match = regex.exec(node.value);
        while (match !== null) {
          const src = regex === htmlImageRegex ? match[1] : match[2];
          const alt = regex === htmlImageRegex ? match[2] : match[1];
          if (src && !seenImages.has(src) && !matched.has(src)) {
            seenImages.add(src);
            matched.add(src);
            images.push({
              path: src,
              alt: alt || null,
              line: node.position?.start.line ?? 0,
              remote: isRemoteUrl(src),
            });
          }
          match = regex.exec(node.value);
        }
      }
    }

    if (node.type === "code" && typeof node.value === "string") {
      codeBlocks.push({
        language: node.lang || null,
        code: node.value,
        line: node.position?.start.line ?? 0,
      });
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        visit(child as typeof node);
      }
    }
  }

  visit(tree as unknown as Parameters<typeof visit>[0]);
  return { images, codeBlocks, title };
}
function isRemoteUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

export async function loadImage(
  imagePath: string,
  baseDir: string,
  imageBasePath: string,
  maxSize: number,
): Promise<{ bytes: Uint8Array; format: string } | null> {
  let resolvedPath: string;

  if (isAbsolute(imagePath)) {
    if (!imageBasePath) {
      console.warn(
        `⚠️  No imageBasePath configured for absolute path: ${imagePath}`,
      );
      return null;
    }
    resolvedPath = join(imageBasePath, imagePath);
  } else {
    resolvedPath = resolve(baseDir, imagePath);
  }

  try {
    const stats = await stat(resolvedPath);
    if (stats.size > maxSize) {
      console.warn(`⚠️  Image too large (${stats.size} bytes): ${imagePath}`);
      return null;
    }

    const ext = resolvedPath.split(".").pop()?.toLowerCase();
    const formatMap: Record<string, string> = {
      png: "png",
      jpg: "jpeg",
      jpeg: "jpeg",
      gif: "gif",
      webp: "webp",
    };

    const format = ext ? formatMap[ext] : undefined;
    if (!format) {
      console.warn(`⚠️  Unsupported image format: ${imagePath}`);
      return null;
    }

    const buffer = await readFile(resolvedPath);
    return { bytes: new Uint8Array(buffer), format };
  } catch (error) {
    console.warn(`⚠️  Failed to load image: ${imagePath} - ${error}`);
    return null;
  }
}
