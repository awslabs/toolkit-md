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
 * @fileoverview Link resolution against a content tree.
 *
 * Resolves markdown link URLs to content nodes using the tree's logical
 * path index. Separated from the tree structure itself since only link
 * checking requires this behavior.
 */

import * as path from "node:path";
import type { ContentNode } from "./ContentNode.js";

/**
 * Interface for the node lookup a link resolver requires.
 */
export interface NodeLookup {
  getNode(nodePath: string): ContentNode | null;
}

/**
 * Resolves link URLs to content nodes in a content tree.
 *
 * Attempts multiple resolution strategies to find a matching node:
 * direct logical path lookup (stripping extension and language suffix)
 * and index file lookup for directory-style links.
 */
export class LinkResolver {
  constructor(private readonly tree: NodeLookup) {}

  /**
   * Resolves a link URL to a content node in the tree.
   *
   * @param url - The link URL to resolve (e.g., './pods', '/advanced/secrets/', '../basics/introduction.md')
   * @param fromNodePath - The logical path of the node containing the link, used for relative resolution
   * @returns The matching content node if found, null otherwise
   */
  resolve(url: string, fromNodePath: string): ContentNode | null {
    const cleanUrl = this.stripFragmentAndQuery(url);
    if (!cleanUrl) {
      return null;
    }

    const resolved = this.resolveRelativePath(cleanUrl, fromNodePath);
    const candidates = this.buildLookupCandidates(resolved);

    for (const candidate of candidates) {
      const node = this.tree.getNode(candidate);
      if (node) {
        if (node.isDirectory) {
          const indexNode = this.tree.getNode(path.join(candidate, "index"));
          if (indexNode) {
            return indexNode;
          }
          continue;
        }
        return node;
      }
    }

    return null;
  }

  private stripFragmentAndQuery(url: string): string {
    let clean = url;
    const fragmentIndex = clean.indexOf("#");
    if (fragmentIndex >= 0) {
      clean = clean.substring(0, fragmentIndex);
    }
    const queryIndex = clean.indexOf("?");
    if (queryIndex >= 0) {
      clean = clean.substring(0, queryIndex);
    }
    return clean;
  }

  private resolveRelativePath(url: string, fromNodePath: string): string {
    if (url.startsWith("/")) {
      return url.substring(1);
    }

    const fromDir = fromNodePath ? path.dirname(fromNodePath) : "";
    const joined = fromDir ? path.join(fromDir, url) : url;
    const normalized = path.normalize(joined);
    if (normalized.startsWith("/")) {
      return normalized.substring(1);
    }
    return normalized;
  }

  private buildLookupCandidates(resolved: string): string[] {
    let normalized = resolved.replace(/\\/g, "/");
    if (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    if (normalized === "." || normalized === "" || normalized === "/") {
      return [""];
    }

    const candidates: string[] = [];

    const withoutExt = this.stripMarkdownExtension(normalized);
    const withoutLang = this.stripLanguageSuffix(withoutExt);

    candidates.push(withoutLang);
    if (withoutLang !== withoutExt) {
      candidates.push(withoutExt);
    }
    if (withoutExt !== normalized) {
      candidates.push(normalized);
    }

    candidates.push(path.join(withoutLang, "index"));
    candidates.push(path.join(normalized, "index"));

    return candidates;
  }

  private stripMarkdownExtension(p: string): string {
    if (p.endsWith(".md") || p.endsWith(".mdx")) {
      return p.substring(0, p.lastIndexOf("."));
    }
    return p;
  }

  private stripLanguageSuffix(p: string): string {
    const parts = p.split("/");
    const last = parts[parts.length - 1];
    const dotParts = last.split(".");
    if (dotParts.length > 1 && dotParts[dotParts.length - 1].length <= 5) {
      parts[parts.length - 1] = dotParts.slice(0, -1).join(".");
      return parts.join("/");
    }
    return p;
  }
}
