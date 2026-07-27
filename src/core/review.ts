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
 * @fileoverview Review pipeline service.
 *
 * Transport-agnostic implementation of the review operation. Walks the
 * content tree, optionally scopes work to files present in a unified diff,
 * runs automated checks, invokes the model through a forced write_file
 * tool call, and produces per-file diffs plus an optional summary. Emits
 * progress events rather than writing to the terminal so it can be driven
 * by the CLI, MCP server, or tests.
 */

import * as path from "node:path";
import { createPatch } from "diff";
import type {
  BedrockClient,
  ContextStrategy,
  Exemplar,
  FileDiff,
  TokenUsage,
} from "../ai/index.js";
import {
  buildReviewPrompt,
  REVIEW_WRITE_TOOL_NAME,
  type ReviewEditMode,
} from "../ai/prompts/reviewPrompt.js";
import { buildSummarizePrompt } from "../ai/prompts/summaryPrompt.js";
import { checkNode } from "../check/index.js";
import type { CheckOptions } from "../check/types.js";
import type { ContentNode, ContentTree } from "../content/index.js";
import {
  filterDiffByChangedLines,
  type ParsedDiff,
} from "../content/utils/diffUtils.js";
import type { Language } from "../languages/index.js";
import { runFileEditSession } from "./fileEditSession.js";
import { generateFileContent } from "./fileWriteTool.js";

export interface ReviewServiceOptions {
  /** Tree containing the content to review */
  tree: ContentTree;

  /** Model client used for review */
  client: BedrockClient;

  /** Language of the content */
  language: Language;

  /** Strategy for including sibling content in prompts */
  contextStrategy: ContextStrategy;

  /** Style guide contents to include in prompts */
  styleGuides: string[];

  /** Exemplar content to include in prompts */
  exemplars: Exemplar[];

  /** Additional reviewer instructions */
  instructions?: string;

  /** Parsed unified diff restricting review scope, if provided */
  parsedDiff?: ParsedDiff | null;

  /** Context lines around diff changes when filtering suggestions */
  diffContext: number;

  /** Check options when automated checks should inform the review */
  checkOptions?: CheckOptions | null;

  /** Write accepted revisions back to the tree */
  write: boolean;

  /** Whether to attach local images referenced by the content */
  includeImages: boolean;

  /** Maximum number of images to attach */
  maxImages: number;

  /** Maximum image size in bytes */
  maxImageSize: number;

  /** URL prefix indicating a link points to the static directory */
  staticPrefix?: string;

  /** Directory containing static assets */
  staticDir?: string;

  /** Whether to enable prompt caching */
  cacheEnabled: boolean;

  /** How the model returns changes (default: whole-file write) */
  editMode?: ReviewEditMode;

  /** Receives per-turn tool dispatch messages for debugging */
  onDebug?: (message: string) => void;
}

/**
 * Progress events emitted while the review pipeline runs.
 *
 * - `reviewing`: Model generation is starting for a file.
 * - `reviewed`: A file was reviewed and produced a (possibly filtered) diff.
 * - `unchanged`: The model reviewed the file and found no changes needed.
 * - `no-suggestions`: Diff filtering removed all suggestions for a file.
 */
export type ReviewEvent =
  | { kind: "reviewing"; node: ContentNode }
  | {
      kind: "reviewed";
      node: ContentNode;
      original: string;
      revised: string;
      diff: string;
      written: boolean;
      usage: TokenUsage;
    }
  | { kind: "unchanged"; node: ContentNode; summary: string; usage: TokenUsage }
  | { kind: "no-suggestions"; node: ContentNode };

export interface ReviewResult {
  /** Per-file diffs produced by the review */
  diffs: FileDiff[];
}

/**
 * Determines whether a node path matches a diff file path suffix.
 */
export function matchesDiffPath(
  nodePath: string,
  diffFilePath: string,
): boolean {
  return path.normalize(nodePath).endsWith(path.normalize(diffFilePath));
}

/**
 * Finds the diff entry corresponding to a node path, if any.
 */
export function findDiffPathForNode(
  parsedDiff: ParsedDiff,
  nodePath: string,
): string | undefined {
  return Object.keys(parsedDiff).find((diffFilePath) =>
    matchesDiffPath(nodePath, diffFilePath),
  );
}

/**
 * Validates that every file in the diff exists in the content tree.
 *
 * @param parsedDiff - Parsed unified diff
 * @param nodes - Content nodes to match against
 * @throws {Error} When a diff file has no corresponding content node
 */
export function validateDiffFiles(
  parsedDiff: ParsedDiff,
  nodes: ContentNode[],
): void {
  for (const diffFilePath of Object.keys(parsedDiff)) {
    const fileExists = nodes.some((node) =>
      matchesDiffPath(node.filePath || node.path, diffFilePath),
    );

    if (!fileExists) {
      throw new Error(
        `File ${diffFilePath} from diff not found in content tree`,
      );
    }
  }
}

/**
 * Runs the review pipeline over the content tree.
 *
 * When a parsed diff is provided, only files present in the diff are
 * reviewed and suggestions are filtered to those overlapping the changed
 * lines. In write mode, revised content is persisted through the tree.
 *
 * @param options - Pipeline inputs and behavior flags
 * @param onEvent - Callback invoked for each progress event
 * @returns The per-file diffs produced by the review
 */
export async function reviewContent(
  options: ReviewServiceOptions,
  onEvent: (event: ReviewEvent) => void,
): Promise<ReviewResult> {
  const {
    tree,
    client,
    language,
    contextStrategy,
    styleGuides,
    exemplars,
    instructions,
    parsedDiff,
    diffContext,
    checkOptions,
    write,
    includeImages,
    maxImages,
    maxImageSize,
    staticPrefix,
    staticDir,
    cacheEnabled,
    editMode = "write",
    onDebug,
  } = options;

  const nodes = tree.getFlattenedTree();

  if (parsedDiff) {
    validateDiffFiles(parsedDiff, nodes);
  }

  const diffs: FileDiff[] = [];

  for (const node of nodes) {
    if (!node.content) {
      continue;
    }

    const nodePath = node.filePath || node.path;

    if (parsedDiff && !findDiffPathForNode(parsedDiff, nodePath)) {
      continue;
    }

    const checkIssues = checkOptions
      ? (await checkNode(node, checkOptions))?.issues
      : undefined;

    const prompt = await buildReviewPrompt(tree, node, {
      language,
      contextStrategy,
      styleGuides,
      exemplars,
      instructions,
      includeImages,
      maxImages,
      maxImageSize,
      staticPrefix,
      staticDir,
      checkIssues,
      editMode,
    });

    onEvent({ kind: "reviewing", node });

    const original = node.content;

    let revised: string;
    let usage: TokenUsage;

    if (editMode === "edits") {
      const session = await runFileEditSession(client, prompt, {
        filePath: nodePath,
        originalContent: original,
        cacheEnabled,
        onDebug,
      });

      if (!session.changed) {
        onEvent({
          kind: "unchanged",
          node,
          summary: session.summary,
          usage: session.usage,
        });
        continue;
      }

      revised = session.content;
      usage = session.usage;
    } else {
      const generated = await generateFileContent(client, prompt, {
        toolName: REVIEW_WRITE_TOOL_NAME,
        toolDescription:
          "Writes the complete revised content for the file being reviewed",
        cacheEnabled,
        filePath: nodePath,
        originalContent: original,
        onDebug,
      });

      revised = generated.content;
      usage = generated.usage;
    }

    let aiDiff = createPatch(nodePath, original, revised);

    if (parsedDiff) {
      const diffFilePath = findDiffPathForNode(parsedDiff, nodePath);

      if (diffFilePath) {
        const changedRanges = parsedDiff[diffFilePath];
        aiDiff = filterDiffByChangedLines(aiDiff, changedRanges, diffContext);

        if (aiDiff === "") {
          onEvent({ kind: "no-suggestions", node });
          continue;
        }
      }
    }

    diffs.push({
      path: nodePath,
      diff: aiDiff,
    });

    if (write) {
      await tree.updateContent(node, revised);
    }

    onEvent({
      kind: "reviewed",
      node,
      original,
      revised,
      diff: aiDiff,
      written: write,
      usage,
    });
  }

  return { diffs };
}

/**
 * Generates a markdown summary of review diffs using the model.
 *
 * @param client - Model client
 * @param diffs - Per-file diffs produced by the review
 * @param diffFiltered - Whether diff-based filtering was applied
 * @returns The summary content
 */
export async function summarizeReview(
  client: BedrockClient,
  diffs: FileDiff[],
  diffFiltered: boolean,
): Promise<string> {
  const summaryPrompt = buildSummarizePrompt(diffs);

  const response = await client.generate(summaryPrompt, false);

  let summaryContent = response.output;

  if (diffFiltered) {
    summaryContent = `> **Note:** This summary was generated using diff-based filtering. Only suggestions overlapping with changes in the provided diff file are included.\n\n${summaryContent}`;
  }

  return summaryContent;
}
