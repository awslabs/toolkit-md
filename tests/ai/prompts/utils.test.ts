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

import { describe, expect, it } from "vitest";
import { buildFileList, getContext } from "../../../src/ai/prompts/utils.js";
import {
  createMockEmptyTreeNode,
  createMockTree,
  createMockTreeNode,
} from "../../testUtils.js";

describe("getContext", () => {
  it("should return all content for the everything strategy", () => {
    const tree = createMockTree("en");
    const current = tree.forceAdd("/docs/a.md", "# A");
    tree.forceAdd("/docs/b.md", "# B");

    const context = getContext(tree, current, "everything");

    expect(context.length).toBe(2);
  });

  it("should return only the current node for the nothing strategy", () => {
    const tree = createMockTree("en");
    const current = tree.forceAdd("/docs/a.md", "# A");
    tree.forceAdd("/docs/b.md", "# B");

    const context = getContext(tree, current, "nothing");

    expect(context).toEqual([current]);
  });

  it("should return siblings for the siblings strategy", () => {
    const tree = createMockTree("en");
    const current = tree.forceAdd("/docs/a.md", "# A");
    tree.forceAdd("/docs/b.md", "# B");
    tree.forceAdd("/other/c.md", "# C");

    const context = getContext(tree, current, "siblings");

    expect(context.map((n) => n.name).sort()).toEqual(["a", "b"]);
  });
});

describe("buildFileList", () => {
  it("should map content nodes to files", () => {
    const nodes = [
      createMockTreeNode("/docs/a.md", "# A"),
      createMockTreeNode("/docs/b.md", "# B"),
    ];

    const files = buildFileList(nodes);

    expect(files).toEqual([
      { path: "/docs/a.md", content: "# A" },
      { path: "/docs/b.md", content: "# B" },
    ]);
  });

  it("should filter out nodes without content", () => {
    const nodes = [
      createMockTreeNode("/docs/a.md", "# A"),
      createMockEmptyTreeNode("/docs/empty.md"),
    ];

    const files = buildFileList(nodes);

    expect(files.length).toBe(1);
    expect(files[0].path).toBe("/docs/a.md");
  });
});
