import { describe, expect, it } from "vitest";
import {
  type ChangedLineRange,
  filterDiffByChangedLines,
  isLineInChangedRanges,
  parseUnifiedDiff,
} from "../../../src/content/utils/diffUtils.js";

describe("diffUtils", () => {
  describe("parseUnifiedDiff", () => {
    it("should parse single-file diff with one hunk", () => {
      const diff = `--- a/test.md
+++ b/test.md
@@ -1,3 +1,4 @@
 Line 1
+Line 2 added
 Line 3
 Line 4
`;

      const result = parseUnifiedDiff(diff, "");

      expect(result).toHaveProperty("test.md");
      expect(result["test.md"]).toEqual([{ start: 2, end: 2 }]);
    });

    it("should parse multi-file diff", () => {
      const diff = `--- a/file1.md
+++ b/file1.md
@@ -1,2 +1,3 @@
 Line 1
+Added line
 Line 2
--- a/file2.md
+++ b/file2.md
@@ -5,2 +5,3 @@
 Line 5
+Another added line
 Line 6
`;

      const result = parseUnifiedDiff(diff, "");

      expect(result).toHaveProperty("file1.md");
      expect(result).toHaveProperty("file2.md");
      expect(result["file1.md"]).toEqual([{ start: 2, end: 2 }]);
      expect(result["file2.md"]).toEqual([{ start: 6, end: 6 }]);
    });

    it("should parse diff with multiple hunks per file", () => {
      const diff = `--- a/test.md
+++ b/test.md
@@ -1,2 +1,3 @@
 Line 1
+Added line 1
 Line 2
@@ -10,2 +11,3 @@
 Line 10
+Added line 2
 Line 11
`;

      const result = parseUnifiedDiff(diff, "");

      expect(result["test.md"]).toEqual([
        { start: 2, end: 2 },
        { start: 12, end: 12 },
      ]);
    });

    it("should extract line ranges for additions", () => {
      const diff = `--- a/test.md
+++ b/test.md
@@ -5,1 +5,3 @@
 Line 5
+Line 6 added
+Line 7 added
`;

      const result = parseUnifiedDiff(diff, "");

      expect(result["test.md"]).toEqual([{ start: 6, end: 7 }]);
    });

    it("should extract line ranges for deletions", () => {
      const diff = `--- a/test.md
+++ b/test.md
@@ -5,3 +5,1 @@
 Line 5
-Line 6 deleted
-Line 7 deleted
`;

      const result = parseUnifiedDiff(diff, "");

      expect(result["test.md"]).toEqual([{ start: 6, end: 6 }]);
    });

    it("should extract line ranges for modifications", () => {
      const diff = `--- a/test.md
+++ b/test.md
@@ -5,3 +5,3 @@
 Line 5
-Line 6 old
+Line 6 new
 Line 7
`;

      const result = parseUnifiedDiff(diff, "");

      expect(result["test.md"]).toEqual([{ start: 6, end: 6 }]);
    });

    it("should handle empty diff", () => {
      const diff = "";

      const result = parseUnifiedDiff(diff, "");

      expect(result).toEqual({});
    });

    it("should handle malformed diff gracefully", () => {
      const diff = "This is not a valid diff";

      const result = parseUnifiedDiff(diff, "");

      expect(result).toEqual({});
    });
  });

  describe("isLineInChangedRanges", () => {
    const ranges: ChangedLineRange[] = [
      { start: 10, end: 12 },
      { start: 20, end: 22 },
    ];

    it("should return true for line within changed range with context 0", () => {
      expect(isLineInChangedRanges(10, ranges, 0)).toBe(true);
      expect(isLineInChangedRanges(11, ranges, 0)).toBe(true);
      expect(isLineInChangedRanges(12, ranges, 0)).toBe(true);
    });

    it("should return false for line outside changed range with context 0", () => {
      expect(isLineInChangedRanges(9, ranges, 0)).toBe(false);
      expect(isLineInChangedRanges(13, ranges, 0)).toBe(false);
    });

    it("should return true for line within context window of 3", () => {
      expect(isLineInChangedRanges(7, ranges, 3)).toBe(true);
      expect(isLineInChangedRanges(15, ranges, 3)).toBe(true);
      expect(isLineInChangedRanges(17, ranges, 3)).toBe(true);
      expect(isLineInChangedRanges(25, ranges, 3)).toBe(true);
    });

    it("should return false for line outside context window of 3", () => {
      expect(isLineInChangedRanges(6, ranges, 3)).toBe(false);
      expect(isLineInChangedRanges(16, ranges, 3)).toBe(false);
      expect(isLineInChangedRanges(26, ranges, 3)).toBe(false);
    });

    it("should return true for line within context window of 5", () => {
      expect(isLineInChangedRanges(5, ranges, 5)).toBe(true);
      expect(isLineInChangedRanges(17, ranges, 5)).toBe(true);
      expect(isLineInChangedRanges(27, ranges, 5)).toBe(true);
    });

    it("should not allow negative line numbers with context", () => {
      const earlyRanges: ChangedLineRange[] = [{ start: 2, end: 3 }];
      expect(isLineInChangedRanges(1, earlyRanges, 5)).toBe(true);
    });

    it("should handle empty ranges", () => {
      expect(isLineInChangedRanges(10, [], 3)).toBe(false);
    });
  });

  describe("filterDiffByChangedLines", () => {
    it("should keep AI suggestions that fully overlap with changed lines", () => {
      const changedRanges: ChangedLineRange[] = [{ start: 5, end: 7 }];
      const aiDiff = `--- a/test.md
+++ b/test.md
@@ -5,3 +5,3 @@
 Line 5
-Line 6 old
+Line 6 new
 Line 7
`;

      const result = filterDiffByChangedLines(aiDiff, changedRanges, 0);

      expect(result).toContain("Line 6 old");
      expect(result).toContain("Line 6 new");
      expect(result).not.toBe("");
    });

    it("should keep AI suggestions that partially overlap with changed lines", () => {
      const changedRanges: ChangedLineRange[] = [{ start: 5, end: 6 }];
      const aiDiff = `--- a/test.md
+++ b/test.md
@@ -5,4 +5,4 @@
 Line 5
-Line 6 old
+Line 6 new
 Line 7
 Line 8
`;

      const result = filterDiffByChangedLines(aiDiff, changedRanges, 0);

      expect(result).toContain("Line 6 old");
      expect(result).toContain("Line 6 new");
      expect(result).not.toBe("");
    });

    it("should return empty string when AI suggestions don't overlap", () => {
      const changedRanges: ChangedLineRange[] = [{ start: 5, end: 7 }];
      const aiDiff = `--- a/test.md
+++ b/test.md
@@ -15,3 +15,3 @@
 Line 15
-Line 16 old
+Line 16 new
 Line 17
`;

      const result = filterDiffByChangedLines(aiDiff, changedRanges, 0);

      expect(result).toBe("");
    });

    it("should include nearby AI suggestions with context window", () => {
      const changedRanges: ChangedLineRange[] = [{ start: 5, end: 5 }];
      const aiDiff = `--- a/test.md
+++ b/test.md
@@ -7,3 +7,3 @@
 Line 7
-Line 8 old
+Line 8 new
 Line 9
`;

      const result = filterDiffByChangedLines(aiDiff, changedRanges, 3);

      expect(result).toContain("Line 8 old");
      expect(result).toContain("Line 8 new");
      expect(result).not.toBe("");
    });

    it("should handle multiple hunks in AI diff", () => {
      const changedRanges: ChangedLineRange[] = [
        { start: 5, end: 5 },
        { start: 15, end: 15 },
      ];
      const aiDiff = `--- a/test.md
+++ b/test.md
@@ -5,3 +5,3 @@
 Line 5
-Line 6 old
+Line 6 new
 Line 7
@@ -15,3 +15,3 @@
 Line 15
-Line 16 old
+Line 16 new
 Line 17
`;

      const result = filterDiffByChangedLines(aiDiff, changedRanges, 1);

      expect(result).toContain("Line 6 old");
      expect(result).toContain("Line 6 new");
      expect(result).toContain("Line 16 old");
      expect(result).toContain("Line 16 new");
    });

    it("should reconstruct valid unified diff format", () => {
      const changedRanges: ChangedLineRange[] = [{ start: 6, end: 6 }];
      const aiDiff = `--- a/test.md
+++ b/test.md
@@ -5,3 +5,3 @@
 Line 5
-Line 6 old
+Line 6 new
 Line 7
`;

      const result = filterDiffByChangedLines(aiDiff, changedRanges, 0);

      expect(result).toMatch(/^--- /m);
      expect(result).toMatch(/^\+\+\+ /m);
      expect(result).toMatch(/^@@ /m);
    });
  });
});
