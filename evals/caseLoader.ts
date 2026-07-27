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
 * @fileoverview Corpus case discovery and loading.
 *
 * Each case is a directory containing case.json plus a content/ tree of
 * markdown fixtures. Content loads into memory so cases can be replayed
 * through MockProvider-backed trees without touching the corpus on disk.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { caseManifestSchema, type EvalCase } from "./types.js";

const MANIFEST_FILE = "case.json";
const CONTENT_DIR = "content";

function collectMarkdownFiles(root: string, dir: string): string[] {
  const results: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...collectMarkdownFiles(root, fullPath));
    } else if (entry.name.endsWith(".md")) {
      results.push(path.relative(root, fullPath));
    }
  }

  return results;
}

/**
 * Loads a single eval case from a directory.
 *
 * @param caseDir - Directory containing case.json and content/
 * @param corpusRoot - Corpus root used to derive the case identifier
 * @returns The loaded case with its in-memory content entries
 * @throws {Error} When the manifest is missing or invalid
 */
export function loadCase(caseDir: string, corpusRoot: string): EvalCase {
  const manifestPath = path.join(caseDir, MANIFEST_FILE);

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Case manifest not found: ${manifestPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const parsed = caseManifestSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(
      `Invalid case manifest ${manifestPath}: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(", ")}`,
    );
  }

  const contentRoot = path.join(caseDir, CONTENT_DIR);

  if (!fs.existsSync(contentRoot)) {
    throw new Error(`Case content directory not found: ${contentRoot}`);
  }

  const files = collectMarkdownFiles(contentRoot, contentRoot);

  if (files.length === 0) {
    throw new Error(`Case has no markdown content: ${contentRoot}`);
  }

  const content = files.map((filePath) => ({
    path: filePath,
    content: fs.readFileSync(path.join(contentRoot, filePath), "utf8"),
  }));

  const styleGuides = parsed.data.settings.styleGuides.map((guidePath) => {
    const resolvedPath = path.join(caseDir, guidePath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(
        `Style guide not found for case ${caseDir}: ${resolvedPath}`,
      );
    }

    return fs.readFileSync(resolvedPath, "utf8");
  });

  return {
    id: path.relative(corpusRoot, caseDir).split(path.sep).join("/"),
    dir: caseDir,
    manifest: parsed.data,
    content,
    styleGuides,
  };
}

/**
 * Discovers and loads all cases under a corpus root.
 *
 * A directory is a case when it contains case.json. Discovery recurses so
 * cases can be grouped by operation (corpus/review/..., corpus/translate/...).
 *
 * @param corpusRoot - Root directory of the corpus
 * @param filter - Optional substring filter applied to case identifiers
 * @returns Loaded cases sorted by identifier
 */
export function loadCorpus(corpusRoot: string, filter?: string): EvalCase[] {
  if (!fs.existsSync(corpusRoot)) {
    throw new Error(`Corpus directory not found: ${corpusRoot}`);
  }

  const cases: EvalCase[] = [];

  const visit = (dir: string): void => {
    if (fs.existsSync(path.join(dir, MANIFEST_FILE))) {
      cases.push(loadCase(dir, corpusRoot));
      return;
    }

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        visit(path.join(dir, entry.name));
      }
    }
  };

  visit(corpusRoot);

  const filtered = filter ? cases.filter((c) => c.id.includes(filter)) : cases;

  return filtered.sort((a, b) => a.id.localeCompare(b.id));
}
