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

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { checkImages } from "../../src/check/imageChecker.js";
import type { ImageReference } from "../../src/content/tree/ContentNode.js";

describe("checkImages", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "imagechecker-"));
    await mkdir(join(tempDir, "docs", "images"), { recursive: true });
    await mkdir(join(tempDir, "static", "img"), { recursive: true });
    await writeFile(join(tempDir, "docs", "images", "diagram.png"), "fake-png");
    await writeFile(join(tempDir, "static", "img", "photo.jpg"), "fake-jpg");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("should return no issues for existing relative images", async () => {
    const images: ImageReference[] = [
      {
        path: "./images/diagram.png",
        alt: "Diagram",
        line: 2,
        remote: false,
      },
    ];

    const issues = await checkImages(
      join(tempDir, "docs", "test.md"),
      images,
      5000,
      false,
    );
    expect(issues).toEqual([]);
  });

  test("should detect missing relative images", async () => {
    const images: ImageReference[] = [
      { path: "./images/missing.png", alt: "Missing", line: 3, remote: false },
    ];

    const issues = await checkImages(
      join(tempDir, "docs", "test.md"),
      images,
      5000,
      false,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].category).toBe("image");
    expect(issues[0].rule).toBe("missing-image");
    expect(issues[0].line).toBe(3);
  });

  test("should resolve absolute images against static directory", async () => {
    const images: ImageReference[] = [
      { path: "/img/photo.jpg", alt: "Photo", line: 1, remote: false },
    ];

    const issues = await checkImages(
      join(tempDir, "docs", "test.md"),
      images,
      5000,
      false,
      undefined,
      join(tempDir, "static"),
    );
    expect(issues).toEqual([]);
  });

  test("should detect missing absolute images", async () => {
    const images: ImageReference[] = [
      {
        path: "/img/missing.jpg",
        alt: "Missing",
        line: 5,
        remote: false,
      },
    ];

    const issues = await checkImages(
      join(tempDir, "docs", "test.md"),
      images,
      5000,
      false,
      undefined,
      join(tempDir, "static"),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe("missing-image");
  });

  test("should skip remote images when skipExternal is true", async () => {
    const images: ImageReference[] = [
      {
        path: "https://example.com/image.png",
        alt: "Remote",
        line: 1,
        remote: true,
      },
    ];

    const issues = await checkImages(
      join(tempDir, "docs", "test.md"),
      images,
      5000,
      true,
    );
    expect(issues).toEqual([]);
  });

  test("should handle empty images array", async () => {
    const issues = await checkImages(
      join(tempDir, "docs", "test.md"),
      [],
      5000,
      false,
    );
    expect(issues).toEqual([]);
  });

  test("should strip static prefix before resolving against static directory", async () => {
    const images: ImageReference[] = [
      { path: "/static/img/photo.jpg", alt: "Photo", line: 4, remote: false },
    ];

    const issues = await checkImages(
      join(tempDir, "docs", "test.md"),
      images,
      5000,
      false,
      "/static/",
      join(tempDir, "static"),
    );
    expect(issues).toEqual([]);
  });

  test("should detect missing images with static prefix", async () => {
    const images: ImageReference[] = [
      {
        path: "/static/img/missing.png",
        alt: "Missing",
        line: 7,
        remote: false,
      },
    ];

    const issues = await checkImages(
      join(tempDir, "docs", "test.md"),
      images,
      5000,
      false,
      "/static/",
      join(tempDir, "static"),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].category).toBe("image");
    expect(issues[0].rule).toBe("missing-image");
    expect(issues[0].line).toBe(7);
  });

  test("should resolve absolute images against static directory without prefix", async () => {
    const images: ImageReference[] = [
      { path: "/img/photo.jpg", alt: "Photo", line: 2, remote: false },
    ];

    const issues = await checkImages(
      join(tempDir, "docs", "test.md"),
      images,
      5000,
      false,
      undefined,
      join(tempDir, "static"),
    );
    expect(issues).toEqual([]);
  });
});
