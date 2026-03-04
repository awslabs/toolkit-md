import { describe, expect, it } from "vitest";
import {
  buildSummarizePrompt,
  type FileDiff,
  formatSummaryTable,
  type SuggestionEntry,
} from "../../../src/ai/prompts/summaryPrompt.js";

describe("summaryPrompt", () => {
  describe("buildSummarizePrompt", () => {
    it("should generate prompt with diffs", () => {
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
    });

    it("should include outputSchema", () => {
      const diffs: FileDiff[] = [
        {
          path: "docs/guide.md",
          diff: "some diff",
        },
      ];

      const result = buildSummarizePrompt(diffs);

      expect(result.outputSchema).toBeDefined();
      expect(result.outputSchema?.name).toBe("change_summary");
      expect(result.outputSchema?.schema).toBeDefined();
    });

    it("should not include prefill", () => {
      const diffs: FileDiff[] = [
        {
          path: "docs/guide.md",
          diff: "some diff",
        },
      ];

      const result = buildSummarizePrompt(diffs);

      expect(result.prefill).toBeUndefined();
    });

    it("should handle multiple diffs", () => {
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
    });

    it("should transform JSON output to markdown table", () => {
      const diffs: FileDiff[] = [{ path: "docs/guide.md", diff: "some diff" }];

      const result = buildSummarizePrompt(diffs);

      const jsonOutput = JSON.stringify({
        suggestions: [
          {
            summary: "Fix grammar",
            description: 'Change "is" to "are"',
            file: "docs/guide.md",
            line: 42,
          },
        ],
      });

      const transformed = result.transform?.(jsonOutput) ?? "";

      expect(transformed).toContain("| Suggestion | File |");
      expect(transformed).toContain("Fix grammar");
      expect(transformed).toContain('Change "is" to "are"');
      expect(transformed).toContain("docs/guide.md:42");
      expect(transformed).toContain("docs/guide.md#L42");
    });
  });

  describe("formatSummaryTable", () => {
    it("should format suggestions as a markdown table", () => {
      const suggestions: SuggestionEntry[] = [
        {
          summary: "Fix subject-verb agreement",
          description:
            'Change "The functions is" to "The functions are" for proper grammar',
          file: "docs/guide.md",
          line: 42,
        },
      ];

      const result = formatSummaryTable(suggestions);

      expect(result).toContain("| Suggestion | File |");
      expect(result).toContain("Fix subject-verb agreement");
      expect(result).toContain("[docs/guide.md:42](docs/guide.md#L42)");
    });

    it("should handle multiple suggestions", () => {
      const suggestions: SuggestionEntry[] = [
        {
          summary: "Fix typo",
          description: 'Change "teh" to "the"',
          file: "docs/guide.md",
          line: 10,
        },
        {
          summary: "Improve clarity",
          description: "Reword sentence for better readability",
          file: "docs/tutorial.md",
          line: 25,
        },
      ];

      const result = formatSummaryTable(suggestions);

      expect(result).toContain("Fix typo");
      expect(result).toContain("Improve clarity");
      expect(result).toContain("docs/guide.md:10");
      expect(result).toContain("docs/tutorial.md:25");
    });

    it("should handle empty suggestions", () => {
      const result = formatSummaryTable([]);

      expect(result).toContain("| Suggestion | File |");
      expect(result).toContain("| ---------- | ---- |");
    });
  });
});
