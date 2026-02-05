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
import { extractFileInfo } from "../../../src/content/utils/languageUtils.js";

describe("Language Utils", () => {
  test("should extract language from filename", () => {
    const info1 = extractFileInfo("/docs/guide.fr.md", "en");
    expect(info1.baseName).toBe("guide");
    expect(info1.language).toBe("fr");
    expect(info1.directory).toBe("/docs");
    expect(info1.isIndexFile).toBe(false);

    const info2 = extractFileInfo("/docs/guide.md", "en");
    expect(info2.baseName).toBe("guide");
    expect(info2.language).toBe("en");

    const info3 = extractFileInfo("/docs/index.md", "en");
    expect(info3.baseName).toBe("index");
    expect(info3.isIndexFile).toBe(true);
  });
});
