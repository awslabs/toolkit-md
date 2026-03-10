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

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { checkSpelling } from "../../src/check/spellChecker.js";
import { loadIgnoreWordsFile } from "../../src/commands/utils.js";

describe("checkSpelling", () => {
  test("should return no issues for valid content", async () => {
    const content = "# Valid Heading\n\nSome paragraph text.\n";
    const issues = await checkSpelling("/docs/valid.md", content, []);
    expect(issues).toEqual([]);
  });

  test("should detect misspelled words", async () => {
    const content = "# Heading\n\nThis has a speling eror.\n";
    const issues = await checkSpelling("/docs/bad.md", content, []);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].category).toBe("spell");
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].rule).toBe("spelling");
    expect(issues[0].file).toBe("/docs/bad.md");
  });

  test("should ignore words in the ignore list", async () => {
    const content = "# Heading\n\nThis has a speling eror.\n";
    const issuesWithout = await checkSpelling("/docs/bad.md", content, []);
    const issuesWith = await checkSpelling("/docs/bad.md", content, [
      "speling",
      "eror",
    ]);
    expect(issuesWith.length).toBeLessThan(issuesWithout.length);
  });

  test("should not check code blocks", async () => {
    const content =
      "# Heading\n\n```python\nxyz_qwrty_notaword = 1\n```\n\nSome text.\n";
    const issues = await checkSpelling("/docs/code.md", content, []);
    const codeIssue = issues.find((i) =>
      i.message.includes("xyz_qwrty_notaword"),
    );
    expect(codeIssue).toBeUndefined();
  });

  test("should not check inline code", async () => {
    const content = "# Heading\n\nUse `xyznotaword` in your code.\n";
    const issues = await checkSpelling("/docs/inline.md", content, []);
    const codeIssue = issues.find((i) => i.message.includes("xyznotaword"));
    expect(codeIssue).toBeUndefined();
  });

  test("should not check directive attributes", async () => {
    const content = "# Heading\n\n::video{src=xyznotaword}\n\nSome text.\n";
    const issues = await checkSpelling("/docs/directive.md", content, []);
    const directiveIssue = issues.find((i) =>
      i.message.includes("xyznotaword"),
    );
    expect(directiveIssue).toBeUndefined();
  });

  test("should return empty array for empty content", async () => {
    const issues = await checkSpelling("/docs/empty.md", "", []);
    expect(issues).toEqual([]);
  });

  test("should return empty array for content with only code", async () => {
    const content = "```\nonly code here\n```\n";
    const issues = await checkSpelling("/docs/only-code.md", content, []);
    expect(issues).toEqual([]);
  });

  test("should report correct line numbers", async () => {
    const content = "# Good Heading\n\nSome text\n\nA speling mistake here.\n";
    const issues = await checkSpelling("/docs/lines.md", content, []);
    const spellingIssue = issues.find((i) => i.message.includes("speling"));
    expect(spellingIssue).toBeDefined();
    expect(spellingIssue?.line).toBe(5);
  });

  test("should include the misspelled word in the message", async () => {
    const content = "# Heading\n\nA speling mistake.\n";
    const issues = await checkSpelling("/docs/msg.md", content, []);
    const spellingIssue = issues.find((i) => i.message.includes("speling"));
    expect(spellingIssue).toBeDefined();
    expect(spellingIssue?.message).toContain("speling");
  });

  test("should skip content inside configured skipDirectives", async () => {
    const content =
      "# Heading\n\n:::video\nxyznotaword content here\n:::\n\nReal text.\n";
    const issuesWithout = await checkSpelling(
      "/docs/directive.md",
      content,
      [],
    );
    const issuesWith = await checkSpelling(
      "/docs/directive.md",
      content,
      [],
      ["video"],
    );
    const withoutHas = issuesWithout.some((i) =>
      i.message.includes("xyznotaword"),
    );
    const withHas = issuesWith.some((i) => i.message.includes("xyznotaword"));
    expect(withoutHas).toBe(true);
    expect(withHas).toBe(false);
  });

  test("should use the provided locale for spell checking", async () => {
    const content = "# Heading\n\nSome valid English text.\n";
    const issuesDefault = await checkSpelling(
      "/docs/locale.md",
      content,
      [],
      [],
    );
    const issuesExplicit = await checkSpelling(
      "/docs/locale.md",
      content,
      [],
      [],
      "en",
    );
    expect(issuesDefault).toEqual(issuesExplicit);
  });
});

describe("loadIgnoreWordsFile", () => {
  let tempDir: string;

  test("should load words from a file with one word per line", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "spell-ignore-"));
    const filePath = join(tempDir, "ignore.txt");
    await writeFile(filePath, "Kubernetes\nkubectl\nhelm\n");
    const words = await loadIgnoreWordsFile(filePath, tempDir);
    expect(words).toEqual(["Kubernetes", "kubectl", "helm"]);
    await rm(tempDir, { recursive: true, force: true });
  });

  test("should skip empty lines and comments", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "spell-ignore-"));
    const filePath = join(tempDir, "ignore.txt");
    await writeFile(
      filePath,
      "# Project-specific words\nKubernetes\n\nkubectl\n# Another comment\nhelm\n\n",
    );
    const words = await loadIgnoreWordsFile(filePath, tempDir);
    expect(words).toEqual(["Kubernetes", "kubectl", "helm"]);
    await rm(tempDir, { recursive: true, force: true });
  });

  test("should resolve relative paths against cwd", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "spell-ignore-"));
    const filePath = join(tempDir, "words.txt");
    await writeFile(filePath, "myword\n");
    const words = await loadIgnoreWordsFile("words.txt", tempDir);
    expect(words).toEqual(["myword"]);
    await rm(tempDir, { recursive: true, force: true });
  });

  test("should trim whitespace from words", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "spell-ignore-"));
    const filePath = join(tempDir, "ignore.txt");
    await writeFile(filePath, "  Kubernetes  \n  kubectl\nhelm  \n");
    const words = await loadIgnoreWordsFile(filePath, tempDir);
    expect(words).toEqual(["Kubernetes", "kubectl", "helm"]);
    await rm(tempDir, { recursive: true, force: true });
  });

  test("should return empty array for empty file", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "spell-ignore-"));
    const filePath = join(tempDir, "empty.txt");
    await writeFile(filePath, "");
    const words = await loadIgnoreWordsFile(filePath, tempDir);
    expect(words).toEqual([]);
    await rm(tempDir, { recursive: true, force: true });
  });
});
