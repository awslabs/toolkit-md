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

import { describe, expect, test } from "vitest";
import {
  ContentTree,
  MockProvider,
  renderTreeMap,
} from "../../../src/content/index.js";

function buildTree(entries: Array<{ path: string; content: string }>) {
  const provider = new MockProvider();
  const tree = new ContentTree(provider);
  entries.forEach(({ path, content }) => tree.add(path, content));
  return tree;
}

describe("renderTreeMap", () => {
  test("should not include images by default", () => {
    const tree = buildTree([
      {
        path: "/docs/guide.md",
        content: "---\ntitle: Guide\n---\n![Diagram](./images/diagram.png)",
      },
    ]);

    const treeMap = renderTreeMap(tree.getRoot());
    expect(treeMap).toContain("guide.md");
    expect(treeMap).not.toContain("./images/diagram.png");
  });

  test("should include images when enabled", () => {
    const tree = buildTree([
      {
        path: "/docs/guide.md",
        content:
          "---\ntitle: Guide\n---\n![Diagram](./images/diagram.png)\n![Photo](./assets/photo.jpg)",
      },
    ]);

    const treeMap = renderTreeMap(tree.getRoot(), true);
    expect(treeMap).toContain("guide.md");
    expect(treeMap).toContain("[image] ./images/diagram.png");
    expect(treeMap).toContain("[image] ./assets/photo.jpg");
  });

  test("should render image tree connectors correctly for single image", () => {
    const tree = buildTree([
      {
        path: "/docs/guide.md",
        content: "---\ntitle: Guide\n---\n![Diagram](./diagram.png)",
      },
    ]);

    const treeMap = renderTreeMap(tree.getRoot(), true);
    expect(treeMap).toContain("└── [image] ./diagram.png");
  });

  test("should render image tree connectors correctly for multiple images", () => {
    const tree = buildTree([
      {
        path: "/docs/guide.md",
        content: "---\ntitle: Guide\n---\n![A](./a.png)\n![B](./b.png)",
      },
    ]);

    const treeMap = renderTreeMap(tree.getRoot(), true);
    expect(treeMap).toContain("├── [image] ./a.png");
    expect(treeMap).toContain("└── [image] ./b.png");
  });

  test("should not render image lines for nodes without images when enabled", () => {
    const tree = buildTree([
      {
        path: "/docs/guide.md",
        content: "---\ntitle: Guide\n---\n# No images here",
      },
    ]);

    const treeMap = renderTreeMap(tree.getRoot(), true);
    expect(treeMap).toContain("guide.md");
    expect(treeMap).not.toContain("├── ./");
    expect(treeMap).not.toContain("└── ./");
  });
});
