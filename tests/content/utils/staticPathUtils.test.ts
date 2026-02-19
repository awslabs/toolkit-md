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

import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { resolveStaticPath } from "../../../src/content/utils/staticPathUtils.js";

describe("resolveStaticPath", () => {
  test("should resolve a path matching the static prefix", () => {
    const result = resolveStaticPath(
      "/static/img/photo.jpg",
      "/static/",
      "/project/static",
    );
    expect(result).toBe(join("/project/static", "img/photo.jpg"));
  });

  test("should return null when path does not match the prefix", () => {
    const result = resolveStaticPath(
      "/images/photo.jpg",
      "/static/",
      "/project/static",
    );
    expect(result).toBeNull();
  });

  test("should return null when staticPrefix is undefined", () => {
    const result = resolveStaticPath(
      "/static/img/photo.jpg",
      undefined,
      "/project/static",
    );
    expect(result).toBeNull();
  });

  test("should return null when staticDir is undefined", () => {
    const result = resolveStaticPath(
      "/static/img/photo.jpg",
      "/static/",
      undefined,
    );
    expect(result).toBeNull();
  });

  test("should return null when both are undefined", () => {
    const result = resolveStaticPath("/static/img/photo.jpg");
    expect(result).toBeNull();
  });

  test("should handle path equal to the prefix", () => {
    const result = resolveStaticPath("/static/", "/static/", "/project/static");
    expect(result).toBe(join("/project/static", ""));
  });
});
