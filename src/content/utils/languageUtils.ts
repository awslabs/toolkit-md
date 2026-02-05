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
 * @fileoverview Language detection utilities for content files.
 *
 * Provides functions to extract language information from file paths and names,
 * supporting both explicit language suffixes and default language fallbacks.
 */

import * as path from "node:path";

/**
 * Information extracted from a file path including language and structure details.
 */
export interface FileInfo {
  /** Base name of the file without language suffix or extension */
  baseName: string;
  /** Detected or default language code */
  language: string;
  /** Directory path containing the file */
  directory: string;
  /** Whether this is an index file (index.md or _index.md) */
  isIndexFile: boolean;
  /** Full file path as provided */
  filePath: string;
}

/**
 * Extracts language and structural information from a file path.
 *
 * Parses file paths to separate the base name from the language code and
 * determines directory structure. Supports formats like:
 * - 'guide.en.md' → base: 'guide', language: 'en'
 * - 'guide.md' → base: 'guide', language: defaultLanguage
 * - '/docs/guide.fr.md' → base: 'guide', language: 'fr', directory: '/docs'
 *
 * @param filePath - The file path to parse (e.g., '/docs/guide.en.md')
 * @param defaultLanguage - Default language to use when no language suffix is found
 * @returns FileInfo object containing extracted information
 *
 * @example
 * ```typescript
 * const info = extractLanguageFromPath('/docs/guide.fr.md', 'en');
 * // Returns: {
 * //   baseName: 'guide',
 * //   language: 'fr',
 * //   directory: '/docs',
 * //   isIndexFile: false,
 * //   filePath: '/docs/guide.fr.md'
 * // }
 * ```
 */
export function extractFileInfo(
  filePath: string,
  defaultLanguage: string = "en",
): FileInfo {
  const directory = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const extension = path.extname(fileName);
  const nameWithoutExt = fileName.slice(0, -extension.length);

  const parts = nameWithoutExt.split(".");

  let baseName: string;
  let language: string;

  if (parts.length > 1) {
    // Has potential language suffix
    const potentialLang = parts[parts.length - 1];
    baseName = parts.slice(0, -1).join(".");
    language = potentialLang;
  } else {
    // No language suffix, use default
    baseName = nameWithoutExt;
    language = defaultLanguage;
  }

  const isIndexFile = baseName === "index" || baseName === "_index";

  return {
    baseName,
    language,
    directory,
    isIndexFile,
    filePath,
  };
}
