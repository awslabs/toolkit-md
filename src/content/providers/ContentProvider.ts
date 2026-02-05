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
 * @fileoverview Content provider interface for abstracting content sources.
 *
 * Defines the interface for content providers that can load content from
 * various sources (filesystem, database, API, etc.) and write changes back.
 * This abstraction enables flexible content management and easy testing.
 */

/**
 * Content entry representing a single piece of content with its path.
 */
export interface ContentEntry {
  /** File path or identifier for the content */
  path: string;
  /** Raw content string (typically markdown with frontmatter) */
  content: string;
}

/**
 * Abstract interface for content providers.
 *
 * Content providers are responsible for loading content from various sources
 * and writing changes back to those sources. This abstraction allows the
 * content tree to work with different storage backends without being coupled
 * to any specific implementation.
 *
 * Implementations might include:
 * - FileSystemProvider: Loads from and writes to the filesystem
 * - MockProvider: In-memory provider for testing
 */
export interface ContentProvider {
  /**
   * Loads all content from the provider's source.
   *
   * @returns Promise resolving to an array of content entries
   *
   * @example
   * ```typescript
   * const entries = await provider.loadContent();
   * entries.forEach(({ path, content }) => {
   *   console.log(`Loaded: ${path}`);
   * });
   * ```
   */
  loadContent(): Promise<ContentEntry[]>;

  /**
   * Writes new content to the provider's storage.
   *
   * @param filePath - Path where the content should be stored
   * @param content - Content to write
   * @returns Promise that resolves when the write is complete
   *
   * @example
   * ```typescript
   * await provider.writeContent('/docs/guide.md', '# New Guide');
   * ```
   */
  writeContent(filePath: string, content: string): Promise<void>;

  /**
   * Updates existing content in the provider's storage.
   *
   * @param filePath - Path of the content to update
   * @param content - New content to replace the existing content
   * @returns Promise that resolves when the update is complete
   *
   * @example
   * ```typescript
   * await provider.updateContent('/docs/guide.md', '# Updated Guide');
   * ```
   */
  updateContent(filePath: string, content: string): Promise<void>;

  /**
   * Deletes content from the provider's storage.
   *
   * @param filePath - Path of the content to delete
   * @returns Promise that resolves when the deletion is complete
   *
   * @example
   * ```typescript
   * await provider.deleteContent('/docs/old-guide.md');
   * ```
   */
  deleteContent(filePath: string): Promise<void>;
}
