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
import { checkLint } from "../../src/check/lintChecker.js";

describe("checkLint", () => {
  test("should return no issues for valid markdown", async () => {
    const content = "# Valid Heading\n\nSome paragraph text.\n";
    const issues = await checkLint("/docs/valid.md", content, []);
    expect(issues).toEqual([]);
  });

  test("should detect linting issues", async () => {
    const content = "#Bad Heading\n";
    const issues = await checkLint("/docs/bad.md", content, []);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].category).toBe("lint");
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].file).toBe("/docs/bad.md");
  });

  test("should ignore specified rules", async () => {
    const content = "#Bad Heading\n";
    const issuesWithout = await checkLint("/docs/bad.md", content, []);
    const issuesWith = await checkLint("/docs/bad.md", content, [
      "MD018",
      "MD041",
    ]);

    expect(issuesWithout.length).toBeGreaterThan(issuesWith.length);
  });

  test("should ignore rules by alias", async () => {
    const content = "#Bad Heading\n";
    const issuesWithout = await checkLint("/docs/bad.md", content, []);
    const issuesWith = await checkLint("/docs/bad.md", content, [
      "no-missing-space-atx",
      "first-line-heading",
    ]);

    expect(issuesWithout.length).toBeGreaterThan(issuesWith.length);
  });

  test("should include rule names in issue output", async () => {
    const content = "#Bad Heading\n";
    const issues = await checkLint("/docs/bad.md", content, []);
    const atxIssue = issues.find((i) => i.rule.includes("MD018"));
    expect(atxIssue).toBeDefined();
    expect(atxIssue?.rule).toContain("/");
  });

  test("should report correct line numbers", async () => {
    const content = "# Good Heading\n\nSome text\n\n#Bad Heading\n";
    const issues = await checkLint("/docs/lines.md", content, ["MD041"]);
    const atxIssue = issues.find((i) => i.rule.includes("MD018"));
    expect(atxIssue?.line).toBe(5);
  });

  test("should return empty array for empty content", async () => {
    const issues = await checkLint("/docs/empty.md", "", []);
    expect(issues).toEqual([]);
  });
});
