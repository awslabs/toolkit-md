import { describe, expect, it } from "vitest";
import {
  buildSummarizePrompt,
  type FileDiff,
} from "../../../src/ai/prompts/summaryPrompt.js";

describe("summaryPrompt", () => {
  describe("buildSummarizePrompt", () => {
    it("should generate prompt with filtered diffs", () => {
      const diffs: FileDiff[] = [
        {
          path: "docs/guide.md",
          diff: `--- a/docs/guide.md
+++ b/docs/guide.md
@@ -10,3 +10,3 @@
 Line 10
-Old text
+New text
 Line 12
`,
        },
      ];

      const result = buildSummarizePrompt(diffs);

      expect(result.prompt).toContain("docs/guide.md");
      expect(result.prompt).toContain("Old text");
      expect(result.prompt).toContain("New text");
      expect(result.prefill).toBe("| Suggestion");
    });

    it("should handle multiple filtered diffs", () => {
      const diffs: FileDiff[] = [
        {
          path: "docs/guide.md",
          diff: `--- a/docs/guide.md
+++ b/docs/guide.md
@@ -10,3 +10,3 @@
 Line 10
-Old text
+New text
 Line 12
`,
        },
        {
          path: "docs/tutorial.md",
          diff: `--- a/docs/tutorial.md
+++ b/docs/tutorial.md
@@ -5,3 +5,3 @@
 Line 5
-Another old text
+Another new text
 Line 7
`,
        },
      ];

      const result = buildSummarizePrompt(diffs);

      expect(result.prompt).toContain("docs/guide.md");
      expect(result.prompt).toContain("docs/tutorial.md");
      expect(result.prompt).toContain("Old text");
      expect(result.prompt).toContain("Another old text");
    });

    it("should exclude files with no relevant changes", () => {
      const diffs: FileDiff[] = [
        {
          path: "docs/guide.md",
          diff: `--- a/docs/guide.md
+++ b/docs/guide.md
@@ -10,3 +10,3 @@
 Line 10
-Old text
+New text
 Line 12
`,
        },
      ];

      const result = buildSummarizePrompt(diffs);

      expect(result.prompt).toContain("docs/guide.md");
      expect(result.prompt).not.toContain("docs/other.md");
    });

    it("should generate valid summary format", () => {
      const diffs: FileDiff[] = [
        {
          path: "docs/guide.md",
          diff: `--- a/docs/guide.md
+++ b/docs/guide.md
@@ -10,3 +10,3 @@
 Line 10
-Old text
+New text
 Line 12
`,
        },
      ];

      const result = buildSummarizePrompt(diffs);

      expect(result.prompt).toContain("Markdown table");
      expect(result.prompt).toContain("Suggestion");
      expect(result.prompt).toContain("File");
      expect(result.prompt).toContain("file_diffs");
    });
  });
});
