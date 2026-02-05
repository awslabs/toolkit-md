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
import { MockProvider } from "../../../src/content/index.js";

describe("MockProvider", () => {
  test("should create provider with initial content", () => {
    const provider = new MockProvider([
      { path: "/test.md", content: "# Test" },
      { path: "/guide.md", content: "# Guide" },
    ]);

    expect(provider.size()).toBe(2);
    expect(provider.has("/test.md")).toBe(true);
    expect(provider.has("/guide.md")).toBe(true);
  });

  test("should load content", async () => {
    const provider = new MockProvider([
      { path: "/test.md", content: "# Test" },
    ]);

    const entries = await provider.loadContent();

    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe("/test.md");
    expect(entries[0].content).toBe("# Test");
  });

  test("should write and update content", async () => {
    const provider = new MockProvider();

    await provider.writeContent("/new.md", "# New Content");
    expect(provider.has("/new.md")).toBe(true);

    await provider.updateContent("/new.md", "# Updated Content");
    const entries = await provider.loadContent();
    expect(entries[0].content).toBe("# Updated Content");
  });

  test("should delete content", async () => {
    const provider = new MockProvider([
      { path: "/test.md", content: "# Test" },
    ]);

    await provider.deleteContent("/test.md");
    expect(provider.has("/test.md")).toBe(false);
    expect(provider.size()).toBe(0);
  });
});
