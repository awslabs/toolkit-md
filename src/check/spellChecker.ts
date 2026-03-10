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

/**
 * @fileoverview Spell checking for markdown content using cspell-lib.
 *
 * Leverages the prose segments extracted by extractMarkdownElements to
 * spell-check only the prose portions of markdown content. Code blocks,
 * inline code, frontmatter, and HTML are excluded by the shared markdown
 * parser. Directive nodes (e.g. ::video) are traversed normally so their
 * prose children are checked; only :::code directives are skipped since
 * remarkCodeDirective transforms them into code nodes.
 */

import { spellCheckDocument } from "cspell-lib";
import { extractMarkdownElements } from "../content/utils/markdownUtils.js";
import type { CheckIssue } from "./types.js";

/**
 * Runs spell checking on the prose content of a markdown file.
 *
 * @param filePath - Path to the file being checked (used for reporting)
 * @param content - Raw markdown content to spell-check
 * @param ignoreWords - Words to exclude from spell checking
 * @param skipDirectives - Directive names whose content should be skipped
 * @param locale - Language locale for spell checking (e.g. "en", "fr", "de")
 * @returns Array of check issues for misspelled words
 */
export async function checkSpelling(
  filePath: string,
  content: string,
  ignoreWords: string[],
  skipDirectives: string[] = [],
  locale = "en",
): Promise<CheckIssue[]> {
  const { proseSegments } = extractMarkdownElements(content, {
    skipDirectives,
  });

  if (proseSegments.length === 0) {
    return [];
  }

  const proseText = proseSegments.map((s) => s.text).join("\n");

  const result = await spellCheckDocument(
    { uri: filePath, text: proseText, languageId: "plaintext", locale },
    { noConfigSearch: true, generateSuggestions: false },
    { words: ignoreWords },
  );

  const ignoreSet = new Set(ignoreWords.map((w) => w.toLowerCase()));

  const lineStartOffsets: number[] = [];
  let offset = 0;
  for (const segment of proseSegments) {
    lineStartOffsets.push(offset);
    offset += segment.text.length + 1;
  }

  const issues: CheckIssue[] = [];

  for (const issue of result.issues) {
    if (ignoreSet.has(issue.text.toLowerCase())) {
      continue;
    }

    const issueOffset = issue.offset;
    let segmentIndex = 0;
    for (let i = lineStartOffsets.length - 1; i >= 0; i--) {
      if (issueOffset >= lineStartOffsets[i]) {
        segmentIndex = i;
        break;
      }
    }

    const segment = proseSegments[segmentIndex];
    const offsetWithinSegment = issueOffset - lineStartOffsets[segmentIndex];

    const lines = segment.text.substring(0, offsetWithinSegment).split("\n");
    const lineOffset = lines.length - 1;
    const columnOffset =
      lines.length === 1
        ? offsetWithinSegment
        : (lines[lines.length - 1]?.length ?? 0);

    const line = segment.line + lineOffset;
    const column =
      lineOffset === 0 ? segment.column + columnOffset : columnOffset + 1;

    issues.push({
      file: filePath,
      line,
      column,
      severity: "warning",
      category: "spell",
      rule: "spelling",
      message: `Unknown word: "${issue.text}"`,
    });
  }

  return issues;
}
