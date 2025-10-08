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
import { extractFileSection } from "../../../src/ai/prompts/utils.js";

describe("extractFileSection", () => {
  it("should parse a basic file tag correctly", () => {
    const input = '<file path="test.txt">Hello World</file>';
    const result = extractFileSection(input);

    expect(result).toEqual({
      path: "test.txt",
      content: "Hello World",
    });
  });

  it("should handle multiline content", () => {
    const input = `<file path="multiline.txt">Line 1
Line 2
Line 3</file>`;
    const result = extractFileSection(input);

    expect(result).toEqual({
      path: "multiline.txt",
      content: "Line 1\nLine 2\nLine 3",
    });
  });

  it("should trim leading whitespace from content", () => {
    const input =
      '<file path="whitespace.txt">   Content with leading spaces</file>';
    const result = extractFileSection(input);

    expect(result).toEqual({
      path: "whitespace.txt",
      content: "Content with leading spaces",
    });
  });

  it("should handle paths with special characters", () => {
    const input = '<file path="folder/sub-folder/file_name.txt">Content</file>';
    const result = extractFileSection(input);

    expect(result).toEqual({
      path: "folder/sub-folder/file_name.txt",
      content: "Content",
    });
  });

  it("should handle empty content", () => {
    const input = '<file path="empty.txt"></file>';
    const result = extractFileSection(input);

    expect(result).toEqual({
      path: "empty.txt",
      content: "",
    });
  });

  it("should handle extra whitespace around attributes", () => {
    const input = '<file   path="spaced.txt"  >Content</file>';
    const result = extractFileSection(input);

    expect(result).toEqual({
      path: "spaced.txt",
      content: "Content",
    });
  });

  it("should throw error for invalid format", () => {
    const input = "not a file tag";

    expect(() => extractFileSection(input)).toThrow(
      'Invalid file format: Expected <file path="...">content</file>',
    );
  });

  it("should throw error for missing path attribute", () => {
    const input = "<file>Content without path</file>";

    expect(() => extractFileSection(input)).toThrow(
      'Invalid file format: Expected <file path="...">content</file>',
    );
  });

  it("should throw error for empty path attribute", () => {
    const input = '<file path="">Content</file>';

    expect(() => extractFileSection(input)).toThrow(
      "Missing or empty path attribute in file tag",
    );
  });

  it("should handle content with XML-like characters", () => {
    const input =
      '<file path="xml.txt">Content with <tags> and & symbols</file>';
    const result = extractFileSection(input);

    expect(result).toEqual({
      path: "xml.txt",
      content: "Content with <tags> and & symbols",
    });
  });

  it("should handle content with newlines at the beginning", () => {
    const input = `<file path="newlines.txt">
First line after newline
Second line</file>`;
    const result = extractFileSection(input);

    expect(result).toEqual({
      path: "newlines.txt",
      content: "First line after newline\nSecond line",
    });
  });
});
