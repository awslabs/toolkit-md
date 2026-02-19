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
 * @fileoverview Image validation checker for markdown content.
 *
 * Validates that images referenced in markdown content exist on disk
 * (for local images) or are reachable (for remote images). Absolute
 * image paths are resolved against the static directory, with an
 * optional static prefix stripped before resolution.
 */

import { access } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { ImageReference } from "../content/tree/ContentNode.js";
import type { CheckIssue } from "./types.js";

/**
 * Checks all image references in a file for validity.
 *
 * @param filePath - Path to the file being checked (used for reporting and relative resolution)
 * @param images - Image references extracted from the content
 * @param linkTimeout - Timeout in milliseconds for remote image HEAD requests
 * @param skipExternal - Whether to skip validation of remote images
 * @param staticPrefix - Optional URL prefix to strip before resolving against the static directory
 * @param staticDir - Directory for resolving absolute image paths
 * @returns Array of check issues for missing or unreachable images
 */
export async function checkImages(
  filePath: string,
  images: ImageReference[],
  linkTimeout: number,
  skipExternal: boolean,
  staticPrefix?: string,
  staticDir?: string,
): Promise<CheckIssue[]> {
  const issues: CheckIssue[] = [];
  const fileDir = dirname(filePath);

  for (const image of images) {
    if (image.remote) {
      if (skipExternal) {
        continue;
      }
      const issue = await checkRemoteImage(filePath, image, linkTimeout);
      if (issue) {
        issues.push(issue);
      }
    } else {
      const issue = await checkLocalImage(
        filePath,
        image,
        fileDir,
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

async function checkLocalImage(
  filePath: string,
  image: ImageReference,
  fileDir: string,
  staticPrefix?: string,
  staticDir?: string,
): Promise<CheckIssue | null> {
  let resolvedPath: string;

  if (isAbsolute(image.path) && staticDir) {
    const stripped =
      staticPrefix && image.path.startsWith(staticPrefix)
        ? image.path.substring(staticPrefix.length)
        : image.path;
    resolvedPath = join(staticDir, stripped);
  } else {
    resolvedPath = resolve(fileDir, image.path);
  }

  try {
    await access(resolvedPath);
    return null;
  } catch {
    return {
      file: filePath,
      line: image.line,
      column: 1,
      severity: "error",
      category: "image",
      rule: "missing-image",
      message: `Image not found: ${image.path}`,
    };
  }
}

async function checkRemoteImage(
  filePath: string,
  image: ImageReference,
  timeout: number,
): Promise<CheckIssue | null> {
  try {
    const response = await fetch(image.path, {
      method: "HEAD",
      signal: AbortSignal.timeout(timeout),
      redirect: "follow",
    });

    if (!response.ok) {
      return {
        file: filePath,
        line: image.line,
        column: 1,
        severity: "error",
        category: "image",
        rule: "broken-remote-image",
        message: `Remote image returned HTTP ${response.status}: ${image.path}`,
      };
    }

    return null;
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? `Remote image timed out after ${timeout}ms: ${image.path}`
        : `Remote image unreachable: ${image.path}`;

    return {
      file: filePath,
      line: image.line,
      column: 1,
      severity: "error",
      category: "image",
      rule: "broken-remote-image",
      message,
    };
  }
}
