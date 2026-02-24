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
 * @fileoverview Type definitions for the content checking system.
 *
 * Provides interfaces for check results, options, and issues that are shared
 * across the lint, link, and image checkers and consumed by both the CLI
 * command and MCP tool.
 */

import type { ContentTree } from "../content/tree/ContentTree.js";

export type CheckSeverity = "error" | "warning";

export type CheckCategory = "lint" | "link" | "image";

export const CHECK_SEVERITIES: CheckSeverity[] = ["error", "warning"];

export const CHECK_CATEGORIES: CheckCategory[] = ["lint", "link", "image"];

export interface CheckIssue {
  file: string;
  line: number;
  column: number;
  severity: CheckSeverity;
  category: CheckCategory;
  rule: string;
  message: string;
}

export interface CheckOptions {
  contentDir: string;
  rootContentDir?: string;
  contentTree?: ContentTree;
  links: {
    timeout: number;
    skipExternal: boolean;
    ignorePatterns: string[];
  };
  lint: {
    ignoreRules: string[];
  };
  staticPrefix?: string;
  staticDir?: string;
  minSeverity?: CheckSeverity;
  categories?: CheckCategory[];
}

export interface FileCheckResult {
  filePath: string;
  issues: CheckIssue[];
}

export interface CheckResult {
  files: FileCheckResult[];
  totalErrors: number;
  totalWarnings: number;
}
