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
 * @fileoverview Visual rendering of content trees.
 *
 * Produces the tree-drawing-character representation of a content tree
 * used by the map command and content map prompts. Separated from the
 * tree structure itself since rendering is a presentation concern.
 */

import * as path from "node:path";
import type { ContentNode } from "./ContentNode.js";

/**
 * Renders a visual string representation of a tree structure.
 *
 * Recursively builds a tree map showing the hierarchical structure of
 * all nodes, with proper indentation and tree-drawing characters. Only
 * shows content files with their titles from frontmatter.
 *
 * @param root - Root node of the tree to render
 * @param includeImages - Whether to include image paths under each content node
 * @returns String representation of the tree structure
 *
 * @example
 * ```typescript
 * const treeMap = renderTreeMap(tree.getRoot());
 * // Output:
 * // └── docs
 * //     ├── guide.md (title: User Guide)
 * //     └── advanced
 * //         └── secrets.md (title: Managing Secrets)
 * ```
 */
export function renderTreeMap(
  root: ContentNode,
  includeImages = false,
): string {
  return buildTreeMap(root, true, "", includeImages);
}

function buildTreeMap(
  node: ContentNode,
  isLast: boolean,
  indent: string = "",
  includeImages = false,
): string {
  const prefix = `${indent}${isLast ? "└── " : "├── "}`;

  if (!node.isDirectory) {
    if (node.content) {
      let line = `${prefix}${path.basename(node.filePath || "")} (title: ${node.frontmatter?.title || ""})\n`;
      if (includeImages && node.images.length > 0) {
        const imageIndent = `${indent}${isLast ? " " : "│"}   `;
        for (let j = 0; j < node.images.length; j++) {
          const img = node.images[j];
          const isLastImage = j === node.images.length - 1;
          line += `${imageIndent}${isLastImage ? "└── " : "├── "}[image] ${img.path}\n`;
        }
      }
      return line;
    }

    return "";
  }

  let output = "";

  if (node.children.length > 0) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];

      const isLastChild = i === node.children.length - 1;
      const childIndent = `${indent}${isLast ? " " : "│"}   `;

      output += buildTreeMap(child, isLastChild, childIndent, includeImages);
    }

    if (output.length > 0) {
      output = `${prefix}${node.name}\n${output}`;
    }
  }

  return output;
}
