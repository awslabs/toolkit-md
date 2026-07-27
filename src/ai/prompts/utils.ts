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

import type { ContentNode, ContentTree } from "../../content/index.js";

export type ContextStrategy = "everything" | "nothing" | "siblings";

export function getContext(
  tree: ContentTree,
  currentNode: ContentNode,
  strategy: ContextStrategy,
): ContentNode[] {
  switch (strategy) {
    case "everything":
      return tree.getFlattenedTree();
    case "nothing":
      return [currentNode];
    case "siblings":
      return tree.getSiblings(currentNode);
  }
}

export interface File {
  path: string;
  content: string;
}

export function buildFileList(nodes: ContentNode[]): File[] {
  return nodes
    .filter((e) => e.content !== null)
    .map((e) => {
      return {
        path: e.path,
        // biome-ignore lint/style/noNonNullAssertion: Filtered above
        content: e.content!,
      };
    });
}
