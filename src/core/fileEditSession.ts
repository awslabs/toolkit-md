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
 * @fileoverview Delta-based file editing session for agent tool use.
 *
 * Provides the tool set through which the model revises a file using
 * targeted edits instead of rewriting the whole file, reducing output
 * token consumption. Used by review (revising a file in place) and by
 * translate (updating an existing translation from a changed source).
 * Edits are applied to an in-memory working copy; the result is only
 * surfaced once the model signals completion, so a failed edit cannot
 * leave a half-applied file.
 *
 * Tools:
 * - edit_file: applies a batch of exact string replacements
 * - write_file: replaces the entire content (fallback for large rewrites)
 * - finish_review / finish_translation: terminates the session
 */

import { z } from "zod";
import type {
  AgentTool,
  BedrockClient,
  Prompt,
  TokenUsage,
  ToolOutcome,
} from "../ai/index.js";
import { stripTrailingArgumentTag } from "./fileWriteTool.js";

export const EDIT_FILE_TOOL_NAME = "edit_file";
export const WRITE_FILE_TOOL_NAME = "write_file";
export const FINISH_REVIEW_TOOL_NAME = "finish_review";
export const FINISH_TRANSLATION_TOOL_NAME = "finish_translation";

const editFileInputSchema = z.object({
  edits: z
    .array(
      z.object({
        oldText: z
          .string()
          .min(1)
          .describe(
            "Exact text to replace. Must appear exactly once in the current file content. Include enough surrounding context to make it unique.",
          ),
        newText: z.string().describe("Replacement text"),
      }),
    )
    .min(1)
    .describe("Edits to apply in order"),
});

const writeFileInputSchema = z.object({
  path: z.string().describe("Path of the file"),
  content: z
    .string()
    .describe("The complete file content including any frontmatter"),
});

const finishReviewInputSchema = z.object({
  summary: z
    .string()
    .describe(
      "One sentence describing the changes made, or why no changes were needed",
    ),
});

/**
 * The result of a delta editing session.
 */
export interface FileEditResult {
  /** Final content after all applied edits */
  content: string;

  /** Whether any edit changed the content */
  changed: boolean;

  /** The model's closing summary */
  summary: string;

  /** Token usage across the session */
  usage: TokenUsage;
}

/**
 * Applies a batch of exact string replacements to content.
 *
 * @param content - Content to edit
 * @param edits - Replacements to apply in order
 * @returns The edited content
 * @throws {Error} When an edit's oldText is missing or not unique
 */
export function applyEdits(
  content: string,
  edits: Array<{ oldText: string; newText: string }>,
): string {
  let result = content;

  for (const [index, edit] of edits.entries()) {
    const first = result.indexOf(edit.oldText);

    if (first === -1) {
      throw new Error(
        `Edit ${index + 1}: oldText not found in the current file content. It may have been changed by a previous edit; re-read the current content and try again.`,
      );
    }

    const second = result.indexOf(edit.oldText, first + 1);

    if (second !== -1) {
      throw new Error(
        `Edit ${index + 1}: oldText appears more than once in the file. Include more surrounding context to make it unique.`,
      );
    }

    result =
      result.slice(0, first) +
      edit.newText +
      result.slice(first + edit.oldText.length);
  }

  return result;
}

/**
 * Runs a delta editing session over a file.
 *
 * The model is required to call tools on every turn (no free text). It can
 * apply targeted edits, rewrite the whole file, or finish. Edits apply to
 * an in-memory working copy; edit failures are fed back to the model for
 * retry within the tool use loop's turn budget.
 *
 * When a validateResult hook is provided it runs as part of the finish
 * tool: a returned error message rejects the finish and is fed back to
 * the model so it can correct the content before completing.
 *
 * @param client - Model client
 * @param prompt - Prompt to send
 * @param options - File identity, caching, finish tool naming, and validation
 * @returns The final content, whether it changed, and the model's summary
 */
export async function runFileEditSession(
  client: BedrockClient,
  prompt: Prompt,
  options: {
    filePath: string;
    originalContent: string;
    cacheEnabled: boolean;

    /** Name of the terminal tool (default: finish_review) */
    finishToolName?: string;

    /** Description of the terminal tool presented to the model */
    finishToolDescription?: string;

    /**
     * Validates the working content when the model finishes. A returned
     * message rejects the finish and is fed back to the model as a tool
     * error so it can correct the content; null accepts it.
     */
    validateResult?: (content: string) => string | null;

    /** Receives per-turn tool dispatch messages for debugging */
    onDebug?: (message: string) => void;
  },
): Promise<FileEditResult> {
  const finishToolName = options.finishToolName ?? FINISH_REVIEW_TOOL_NAME;
  const finishToolDescription =
    options.finishToolDescription ??
    "Completes the review. Call this after making all edits, or immediately if the file needs no changes.";

  let working = options.originalContent;
  let summary = "";
  let finished = false;

  const editTool: AgentTool = {
    name: EDIT_FILE_TOOL_NAME,
    description:
      "Applies targeted text replacements to the file. Each oldText must match the current file content exactly and be unique. Prefer this over write_file for localized changes.",
    inputSchema: editFileInputSchema,
    handler: async (input): Promise<ToolOutcome> => {
      const { edits } = input as z.infer<typeof editFileInputSchema>;

      try {
        working = applyEdits(working, edits);
      } catch (error) {
        return {
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        };
      }

      return {
        kind: "result",
        content: `Applied ${edits.length} edit${edits.length !== 1 ? "s" : ""}. Call ${finishToolName} when complete, or make further edits.`,
      };
    },
  };

  const writeTool: AgentTool = {
    name: WRITE_FILE_TOOL_NAME,
    description:
      "Replaces the entire content of the file. Only use this when changes are too extensive for targeted edits.",
    inputSchema: writeFileInputSchema,
    handler: async (input): Promise<ToolOutcome> => {
      const { content } = input as z.infer<typeof writeFileInputSchema>;
      working = stripTrailingArgumentTag(content, options.originalContent);

      return {
        kind: "result",
        content: `File content replaced. Call ${finishToolName} when complete.`,
      };
    },
  };

  const finishTool: AgentTool = {
    name: finishToolName,
    description: finishToolDescription,
    inputSchema: finishReviewInputSchema,
    handler: async (input): Promise<ToolOutcome> => {
      const parsed = input as z.infer<typeof finishReviewInputSchema>;

      const validationError = options.validateResult?.(working) ?? null;

      if (validationError) {
        return { kind: "error", message: validationError };
      }

      summary = parsed.summary;
      finished = true;
      return { kind: "done" };
    },
  };

  const { usage, stopReason } = await client.generateWithTools(
    prompt,
    [editTool, writeTool, finishTool],
    {
      requireTool: true,
      cacheEnabled: options.cacheEnabled,
      onDebug: options.onDebug,
    },
  );

  if (!finished && stopReason === "end_turn") {
    throw new Error(
      `Model ended the edit session for ${options.filePath} without calling ${finishToolName}`,
    );
  }

  return {
    content: working,
    changed: working !== options.originalContent,
    summary,
    usage,
  };
}
