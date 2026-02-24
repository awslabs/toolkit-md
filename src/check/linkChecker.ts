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
 * @fileoverview Link validation checker for markdown content.
 *
 * Validates both local file links and remote HTTP(S) links found in
 * markdown content. Local links are resolved relative to the file's
 * directory or the content root for absolute paths.
 */

import { access } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { LinkReference } from "../content/tree/ContentNode.js";
import { resolveStaticPath } from "../content/utils/staticPathUtils.js";
import type { CheckIssue } from "./types.js";

/**
 * Checks all links in a file for validity.
 *
 * @param filePath - Path to the file being checked (used for reporting and relative resolution)
 * @param links - Link references extracted from the content
 * @param contentDir - Root content directory for resolving absolute paths
 * @param timeout - Timeout in milliseconds for HTTP HEAD requests
 * @param skipExternal - Whether to skip validation of external HTTP(S) links
 * @param staticPrefix - Optional URL prefix indicating a link targets the static directory
 * @param staticDir - Optional directory for resolving links that match the static prefix
 * @returns Array of check issues for broken or unreachable links
 */
export async function checkLinks(
  filePath: string,
  links: LinkReference[],
  contentDir: string,
  timeout: number,
  skipExternal: boolean,
  staticPrefix?: string,
  staticDir?: string,
  ignorePatterns: string[] = [],
): Promise<CheckIssue[]> {
  const issues: CheckIssue[] = [];
  const fileDir = dirname(filePath);
  const compiledPatterns = ignorePatterns.map((p) => new RegExp(p));

  for (const link of links) {
    if (isFragmentOnly(link.url)) {
      continue;
    }

    if (compiledPatterns.some((re) => re.test(link.url))) {
      continue;
    }

    if (link.remote) {
      if (skipExternal) {
        continue;
      }
      const issue = await checkRemoteLink(filePath, link, timeout);
      if (issue) {
        issues.push(issue);
      }
    } else {
      const issue = await checkLocalLink(
        filePath,
        link,
        fileDir,
        contentDir,
        staticPrefix,
        staticDir,
      );
      if (issue) {
        issues.push(issue);
      }
    }
  }

  return issues;
}

function isFragmentOnly(url: string): boolean {
  return url.startsWith("#");
}

function stripFragment(url: string): string {
  const fragmentIndex = url.indexOf("#");
  return fragmentIndex >= 0 ? url.substring(0, fragmentIndex) : url;
}

async function checkLocalLink(
  filePath: string,
  link: LinkReference,
  fileDir: string,
  contentDir: string,
  staticPrefix?: string,
  staticDir?: string,
): Promise<CheckIssue | null> {
  const urlWithoutFragment = stripFragment(link.url);
  if (urlWithoutFragment === "") {
    return null;
  }

  let resolvedPath: string;

  if (isAbsolute(urlWithoutFragment)) {
    const staticResolved = resolveStaticPath(
      urlWithoutFragment,
      staticPrefix,
      staticDir,
    );
    resolvedPath = staticResolved ?? join(contentDir, urlWithoutFragment);
  } else {
    resolvedPath = resolve(fileDir, urlWithoutFragment);
  }

  try {
    await access(resolvedPath);
    return null;
  } catch {
    return {
      file: filePath,
      line: link.line,
      column: 1,
      severity: "error",
      category: "link",
      rule: "broken-link",
      message: `Link target not found: ${link.url}`,
    };
  }
}

async function checkRemoteLink(
  filePath: string,
  link: LinkReference,
  timeout: number,
): Promise<CheckIssue | null> {
  try {
    const response = await fetch(link.url, {
      method: "HEAD",
      signal: AbortSignal.timeout(timeout),
      redirect: "follow",
    });

    if (!response.ok) {
      return {
        file: filePath,
        line: link.line,
        column: 1,
        severity: "error",
        category: "link",
        rule: "broken-remote-link",
        message: `Remote link returned HTTP ${response.status}: ${link.url}`,
      };
    }

    return null;
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? `Remote link timed out after ${timeout}ms: ${link.url}`
        : `Remote link unreachable: ${link.url}`;

    return {
      file: filePath,
      line: link.line,
      column: 1,
      severity: "error",
      category: "link",
      rule: "broken-remote-link",
      message,
    };
  }
}
