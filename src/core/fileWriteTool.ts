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
 * @fileoverview Shared write_file agent tool support.
 *
 * Provides the tool through which the model returns complete file content
 * during review and translate operations. The tool captures content into a
 * caller-provided sink rather than writing anywhere itself; the owning
 * service decides whether and where to persist.
 */

import { z } from "zod";
import type {
  AgentTool,
  BedrockClient,
  Prompt,
  TokenUsage,
} from "../ai/index.js";

const fileWriteInputSchema = z.object({
  path: z.string().describe("Path of the file"),
  content: z
    .string()
    .describe("The complete file content including any frontmatter"),
});

const TRAILING_ARGUMENT_TAG = /\s*<\/content>\s*$/;

/**
 * Removes a leaked trailing argument delimiter from model-generated content.
 *
 * Models occasionally leak the closing delimiter of the tool argument they
 * are generating (a trailing "</content>", matching the schema field name)
 * into long string values. The tag is stripped unless the original content
 * legitimately ended with it.
 *
 * @param content - Model-generated file content
 * @param original - The original file content, if known
 * @returns The sanitized content
 */
export function stripTrailingArgumentTag(
  content: string,
  original?: string,
): string {
  const match = content.match(TRAILING_ARGUMENT_TAG);

  if (!match) {
    return content;
  }

  if (original !== undefined && TRAILING_ARGUMENT_TAG.test(original)) {
    return content;
  }

  return `${content.slice(0, match.index).trimEnd()}\n`;
}

/**
 * Creates a write_file tool that captures content into a sink.
 *
 * Content is sanitized for trailing argument-tag leakage before it
 * reaches the sink.
 *
 * @param name - Tool name to present to the model
 * @param description - Tool description to present to the model
 * @param sink - Callback receiving the complete file content
 * @param originalContent - Original file content used to distinguish leaked tags
 * @returns The agent tool
 */
export function createFileWriteTool(
  name: string,
  description: string,
  sink: (content: string) => void,
  originalContent?: string,
): AgentTool {
  return {
    name,
    description,
    inputSchema: fileWriteInputSchema,
    handler: async (input) => {
      const { content } = input as z.infer<typeof fileWriteInputSchema>;
      sink(stripTrailingArgumentTag(content, originalContent));
      return { kind: "done" };
    },
  };
}

/**
 * Invokes the model with a forced write_file tool and returns the captured
 * content.
 *
 * @param client - Model client
 * @param prompt - Prompt to send
 * @param options - Tool identity, caching, and error context
 * @returns The captured content and token usage
 * @throws {Error} When the model completes without providing content
 */
export async function generateFileContent(
  client: BedrockClient,
  prompt: Prompt,
  options: {
    toolName: string;
    toolDescription: string;
    cacheEnabled: boolean;
    filePath: string;
    originalContent?: string;

    /** Receives per-turn tool dispatch messages for debugging */
    onDebug?: (message: string) => void;
  },
): Promise<{ content: string; usage: TokenUsage }> {
  let captured: string | null = null;

  const { usage } = await client.generateWithTools(
    prompt,
    [
      createFileWriteTool(
        options.toolName,
        options.toolDescription,
        (content) => {
          captured = content;
        },
        options.originalContent,
      ),
    ],
    {
      forceTool: options.toolName,
      cacheEnabled: options.cacheEnabled,
      onDebug: options.onDebug,
    },
  );

  if (captured === null) {
    throw new Error(
      `Model did not provide file content for ${options.filePath}`,
    );
  }

  return { content: captured, usage };
}
