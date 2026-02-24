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
 * @fileoverview Content checking orchestrator.
 *
 * Coordinates lint, link, and image checks across a set of content nodes,
 * aggregating results into a unified report. This module is transport-agnostic
 * and can be consumed by both the CLI command and MCP tool.
 */

import { join } from "node:path";
import type { ContentNode } from "../content/tree/ContentNode.js";
import { checkImages } from "./imageChecker.js";
import { checkLinks } from "./linkChecker.js";
import { checkLint } from "./lintChecker.js";
import type {
  CheckCategory,
  CheckOptions,
  CheckResult,
  CheckSeverity,
  FileCheckResult,
} from "./types.js";

const SEVERITY_RANK: Record<CheckSeverity, number> = {
  error: 0,
  warning: 1,
};

function meetsMinSeverity(
  severity: CheckSeverity,
  minSeverity?: CheckSeverity,
): boolean {
  if (!minSeverity) {
    return true;
  }
  return SEVERITY_RANK[severity] <= SEVERITY_RANK[minSeverity];
}

function isCategoryEnabled(
  category: CheckCategory,
  categories?: CheckCategory[],
): boolean {
  if (!categories || categories.length === 0) {
    return true;
  }
  return categories.includes(category);
}

/**
 * Runs all checks (lint, links, images) on a single content node.
 *
 * @param node - Content node to check
 * @param options - Configuration options for the checks
 * @returns Check result for the file, or null if the node was skipped
 */
export async function checkNode(
  node: ContentNode,
  options: CheckOptions,
): Promise<FileCheckResult | null> {
  if (!node.content || node.isDirectory) {
    return null;
  }

  const absolutePath = join(options.contentDir, node.filePath);

  const results = await Promise.all([
    isCategoryEnabled("lint", options.categories)
      ? checkLint(node.filePath, node.content, options.lint.ignoreRules)
      : [],
    isCategoryEnabled("link", options.categories)
      ? checkLinks(
          absolutePath,
          node.links,
          options.rootContentDir ?? options.contentDir,
          options.links.timeout,
          options.links.skipExternal,
          options.staticPrefix,
          options.staticDir,
          options.links.ignorePatterns,
          options.contentTree,
          node.path,
        )
      : [],
    isCategoryEnabled("image", options.categories)
      ? checkImages(
          node.filePath,
          node.images,
          options.links.timeout,
          options.links.skipExternal,
          options.staticPrefix,
          options.staticDir,
        )
      : [],
  ]);

  const issues = results
    .flat()
    .filter((issue) => meetsMinSeverity(issue.severity, options.minSeverity));

  return { filePath: node.filePath, issues };
}

/**
 * Runs all checks (lint, links, images) on the provided content nodes.
 *
 * @param nodes - Flattened content nodes to check
 * @param options - Configuration options for the checks
 * @returns Aggregated check results across all files
 */
export async function checkAll(
  nodes: ContentNode[],
  options: CheckOptions,
): Promise<CheckResult> {
  const files: FileCheckResult[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const node of nodes) {
    const result = await checkNode(node, options);

    if (!result) {
      continue;
    }

    for (const issue of result.issues) {
      if (issue.severity === "error") {
        totalErrors++;
      } else {
        totalWarnings++;
      }
    }

    files.push(result);
  }

  return { files, totalErrors, totalWarnings };
}
