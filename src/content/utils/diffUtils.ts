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

import * as path from "node:path";
import { type ParsedDiff as DiffParsedDiff, parsePatch } from "diff";

export interface ChangedLineRange {
  start: number;
  end: number;
}

export interface ParsedDiff {
  [filePath: string]: ChangedLineRange[];
}

export function parseUnifiedDiff(
  diffContent: string,
  contentDir: string,
): ParsedDiff {
  const patches = parsePatch(diffContent);
  const result: ParsedDiff = {};

  for (const patch of patches) {
    let filePath = patch.newFileName || patch.oldFileName;
    if (!filePath) continue;

    filePath = path.relative(contentDir, filePath.replace(/^[ab]\//, ""));

    const ranges: ChangedLineRange[] = [];

    for (const hunk of patch.hunks) {
      let newLine = hunk.newStart;
      let rangeStart: number | null = null;
      let rangeEnd: number | null = null;

      for (const line of hunk.lines) {
        if (line.startsWith("+")) {
          if (rangeStart === null) {
            rangeStart = newLine;
          }
          rangeEnd = newLine;
          newLine++;
        } else if (line.startsWith("-")) {
          if (rangeStart === null) {
            rangeStart = newLine;
          }
          rangeEnd = newLine;
        } else {
          if (rangeStart !== null && rangeEnd !== null) {
            ranges.push({ start: rangeStart, end: rangeEnd });
            rangeStart = null;
            rangeEnd = null;
          }
          newLine++;
        }
      }

      if (rangeStart !== null && rangeEnd !== null) {
        ranges.push({ start: rangeStart, end: rangeEnd });
      }
    }

    if (ranges.length > 0) {
      result[filePath] = ranges;
    }
  }

  return result;
}

export function isLineInChangedRanges(
  lineNumber: number,
  ranges: ChangedLineRange[],
  contextLines: number,
): boolean {
  for (const range of ranges) {
    const expandedStart = Math.max(1, range.start - contextLines);
    const expandedEnd = range.end + contextLines;

    if (lineNumber >= expandedStart && lineNumber <= expandedEnd) {
      return true;
    }
  }

  return false;
}

export function filterDiffByChangedLines(
  aiSuggestedDiff: string,
  changedRanges: ChangedLineRange[],
  contextLines: number,
): string {
  const patches = parsePatch(aiSuggestedDiff);
  const filteredPatches = [];

  for (const patch of patches) {
    const filteredHunks = [];

    for (const hunk of patch.hunks) {
      let newLine = hunk.newStart;
      const filteredLines = [];
      let hasRelevantChanges = false;

      for (const line of hunk.lines) {
        const isChanged = line.startsWith("+") || line.startsWith("-");
        const lineInRange = isLineInChangedRanges(
          newLine,
          changedRanges,
          contextLines,
        );

        if (isChanged && lineInRange) {
          hasRelevantChanges = true;
        }

        if (lineInRange) {
          filteredLines.push(line);
        }

        if (!line.startsWith("-")) {
          newLine++;
        }
      }

      if (hasRelevantChanges && filteredLines.length > 0) {
        filteredHunks.push({
          ...hunk,
          lines: filteredLines,
        });
      }
    }

    if (filteredHunks.length > 0) {
      filteredPatches.push({
        ...patch,
        hunks: filteredHunks,
      });
    }
  }

  if (filteredPatches.length === 0) {
    return "";
  }

  return reconstructUnifiedDiff(filteredPatches);
}

function reconstructUnifiedDiff(patches: DiffParsedDiff[]): string {
  let result = "";

  for (const patch of patches) {
    result += `--- ${patch.oldFileName}\n`;
    result += `+++ ${patch.newFileName}\n`;

    for (const hunk of patch.hunks) {
      const oldCount = hunk.lines.filter(
        (l: string) => !l.startsWith("+"),
      ).length;
      const newCount = hunk.lines.filter(
        (l: string) => !l.startsWith("-"),
      ).length;

      result += `@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@\n`;

      for (const line of hunk.lines) {
        result += `${line}\n`;
      }
    }
  }

  return result;
}
