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
 * @fileoverview In-memory mock content provider for testing.
 *
 * Provides an in-memory implementation of the ContentProvider interface
 * that's perfect for testing and development scenarios where you don't
 * want to interact with the actual filesystem.
 */

import type { ContentEntry, ContentProvider } from "./ContentProvider.js";

/**
 * In-memory mock content provider.
 *
 * Stores content in memory using a Map, making it perfect for testing
 * scenarios where you want to simulate content operations without
 * touching the filesystem.
 *
 * @example
 * ```typescript
 * // Create with initial content
 * const provider = new MockProvider([
 *   { path: '/docs/guide.md', content: '# Guide' },
 *   { path: '/docs/tutorial.md', content: '# Tutorial' }
 * ]);
 *
 * // Load content
 * const entries = await provider.loadContent();
 * console.log(`Loaded ${entries.length} entries`);
 *
 * // Add new content
 * await provider.writeContent('/docs/new.md', '# New Content');
 *
 * // Update existing content
 * await provider.updateContent('/docs/guide.md', '# Updated Guide');
 * ```
 */
export class MockProvider implements ContentProvider {
  private storage = new Map<string, string>();

  /**
   * Creates a new MockProvider instance.
   *
   * @param initialContent - Optional array of initial content entries
   *
   * @example
   * ```typescript
   * // Empty provider
   * const provider = new MockProvider();
   *
   * // Provider with initial content
   * const provider = new MockProvider([
   *   { path: '/test.md', content: '# Test' },
   *   { path: '/guide.md', content: '# Guide' }
   * ]);
   * ```
   */
  constructor(initialContent: ContentEntry[] = []) {
    initialContent.forEach(({ path, content }) => {
      this.storage.set(path, content);
    });
  }

  /**
   * Loads all content from memory.
   *
   * Returns all content entries currently stored in the provider's
   * internal storage.
   *
   * @returns Promise resolving to array of content entries
   *
   * @example
   * ```typescript
   * const entries = await provider.loadContent();
   * entries.forEach(({ path, content }) => {
   *   console.log(`${path}: ${content.substring(0, 50)}...`);
   * });
   * ```
   */
  async loadContent(): Promise<ContentEntry[]> {
    return Array.from(this.storage.entries()).map(([path, content]) => ({
      path,
      content,
    }));
  }

  /**
   * Writes new content to memory storage.
   *
   * Stores the content in the provider's internal Map using the
   * file path as the key.
   *
   * @param filePath - Path identifier for the content
   * @param content - Content to store
   * @returns Promise that resolves immediately
   *
   * @example
   * ```typescript
   * await provider.writeContent('/docs/new-guide.md', '# New Guide\nContent here');
   * ```
   */
  async writeContent(filePath: string, content: string): Promise<void> {
    this.storage.set(filePath, content);
  }

  /**
   * Updates existing content in memory storage.
   *
   * For the mock provider, this is identical to writeContent as it
   * simply overwrites the existing entry in the Map.
   *
   * @param filePath - Path identifier of the content to update
   * @param content - New content to replace the existing content
   * @returns Promise that resolves immediately
   *
   * @example
   * ```typescript
   * await provider.updateContent('/docs/guide.md', '# Updated Guide\nNew content');
   * ```
   */
  async updateContent(filePath: string, content: string): Promise<void> {
    this.storage.set(filePath, content);
  }

  /**
   * Deletes content from memory storage.
   *
   * Removes the content entry from the provider's internal Map.
   *
   * @param filePath - Path identifier of the content to delete
   * @returns Promise that resolves immediately
   * @throws {Error} When the content doesn't exist
   *
   * @example
   * ```typescript
   * await provider.deleteContent('/docs/old-guide.md');
   * ```
   */
  async deleteContent(filePath: string): Promise<void> {
    if (!this.storage.has(filePath)) {
      throw new Error(`Content not found: ${filePath}`);
    }
    this.storage.delete(filePath);
  }

  /**
   * Gets the current size of the storage.
   *
   * Utility method for testing to check how many entries are stored.
   *
   * @returns Number of content entries in storage
   *
   * @example
   * ```typescript
   * console.log(`Provider contains ${provider.size()} entries`);
   * ```
   */
  size(): number {
    return this.storage.size;
  }

  /**
   * Checks if content exists at the specified path.
   *
   * Utility method for testing to check if content exists without
   * having to load all content.
   *
   * @param filePath - Path to check
   * @returns True if content exists at the path
   *
   * @example
   * ```typescript
   * if (provider.has('/docs/guide.md')) {
   *   console.log('Guide exists');
   * }
   * ```
   */
  has(filePath: string): boolean {
    return this.storage.has(filePath);
  }

  /**
   * Clears all content from storage.
   *
   * Utility method for testing to reset the provider to an empty state.
   *
   * @example
   * ```typescript
   * provider.clear();
   * console.log(`Provider now has ${provider.size()} entries`); // 0
   * ```
   */
  clear(): void {
    this.storage.clear();
  }
}
