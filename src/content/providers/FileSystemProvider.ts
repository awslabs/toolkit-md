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
 * @fileoverview Filesystem-based content provider implementation.
 *
 * Provides content loading and writing capabilities for markdown files stored
 * in the filesystem. Uses globby for efficient file discovery with built-in
 * gitignore support.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { globby } from "globby";
import type { ContentEntry, ContentProvider } from "./ContentProvider.js";

/**
 * Filesystem-based content provider.
 *
 * Loads markdown content from the filesystem using globby for
 * file discovery and provides methods to write changes back to disk.
 * Automatically respects .gitignore files in the root directory.
 *
 * @example
 * ```typescript
 * const provider = new FileSystemProvider('/content');
 *
 * // Load all markdown files
 * const entries = await provider.loadContent();
 *
 * // Write new content
 * await provider.writeContent('/content/docs/guide.md', '# New Guide');
 *
 * // Update existing content
 * await provider.updateContent('/content/docs/guide.md', '# Updated Guide');
 * ```
 */
export class FileSystemProvider implements ContentProvider {
  private cwd: string;

  /**
   * Creates a new FileSystemProvider instance.
   *
   * @param rootPath - Root directory path to search for markdown files
   * @param patterns - Glob patterns to match files (defaults to ['**\/*.md'])
   *
   * @example
   * ```typescript
   * // Default: find all .md files
   * const provider = new FileSystemProvider('/content');
   *
   * // Custom patterns: find specific file types
   * const provider = new FileSystemProvider('/content', ['**\/*.md', '**\/*.mdx']);
   * ```
   */
  constructor(
    private readonly rootPath: string,
    private readonly patterns: string[] = ["**/*.md"],
    private cwdOverride?: string,
  ) {
    this.cwd = cwdOverride || rootPath;
  }

  /**
   * Loads all markdown content from the filesystem.
   *
   * Uses globby to efficiently discover all markdown files matching the
   * configured patterns, automatically respecting .gitignore files.
   *
   * @returns Promise resolving to array of content entries
   * @throws {Error} When files cannot be read or directory doesn't exist
   *
   * @example
   * ```typescript
   * const entries = await provider.loadContent();
   * console.log(`Found ${entries.length} files`);
   *
   * entries.forEach(({ path, content }) => {
   *   console.log(`${path}: ${content.length} characters`);
   * });
   * ```
   */
  async loadContent(): Promise<ContentEntry[]> {
    try {
      const files = await globby(this.patterns, {
        cwd: this.cwd,
        ignoreFiles: [`${path.join(this.cwd, ".gitignore")}`],
      });

      const entries = await Promise.all(
        files.map(async (filePath) => {
          const fullPath = this.buildFullPath(filePath);

          const content = await fs.promises.readFile(fullPath, "utf-8");
          return {
            path: filePath,
            content,
          };
        }),
      );

      return entries;
    } catch (error) {
      throw new Error(
        `Failed to load content from ${this.rootPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Writes new content to a file on the filesystem.
   *
   * Creates any necessary intermediate directories and writes the content
   * to the specified file path.
   *
   * @param filePath - Absolute path where the content should be written
   * @param content - Content to write to the file
   * @returns Promise that resolves when the write is complete
   * @throws {Error} When the file cannot be written
   *
   * @example
   * ```typescript
   * await provider.writeContent('/content/docs/new-guide.md', '# New Guide\nContent here');
   * ```
   */
  async writeContent(filePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.rootPath, filePath);

    try {
      // Ensure the directory exists
      const directory = path.dirname(fullPath);
      await fs.promises.mkdir(directory, { recursive: true });

      // Write the content
      await fs.promises.writeFile(fullPath, content, "utf-8");
    } catch (error) {
      throw new Error(
        `Failed to write content to ${fullPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Updates existing content in a file on the filesystem.
   *
   * For filesystem operations, this is identical to writeContent as it
   * simply overwrites the existing file with new content.
   *
   * @param filePath - Absolute path of the file to update
   * @param content - New content to replace the existing content
   * @returns Promise that resolves when the update is complete
   * @throws {Error} When the file cannot be updated
   *
   * @example
   * ```typescript
   * await provider.updateContent('/content/docs/guide.md', '# Updated Guide\nNew content');
   * ```
   */
  async updateContent(filePath: string, content: string): Promise<void> {
    // For filesystem, update is the same as write
    await this.writeContent(filePath, content);
  }

  /**
   * Deletes a file from the filesystem.
   *
   * Removes the specified file from the filesystem. Does not remove
   * empty directories that may be left behind.
   *
   * @param filePath - Absolute path of the file to delete
   * @returns Promise that resolves when the deletion is complete
   * @throws {Error} When the file cannot be deleted or doesn't exist
   *
   * @example
   * ```typescript
   * await provider.deleteContent('/content/docs/old-guide.md');
   * ```
   */
  async deleteContent(filePath: string): Promise<void> {
    const fullPath = this.buildFullPath(filePath);

    try {
      await fs.promises.unlink(fullPath);
    } catch (error) {
      throw new Error(
        `Failed to delete content at ${fullPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private buildFullPath(filePath: string): string {
    return path.join(this.rootPath, filePath);
  }
}
