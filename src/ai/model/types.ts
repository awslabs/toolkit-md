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

import type { z } from "zod";
import type { Prompt } from "../prompts/index.js";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedTokens: number;
  cacheReadInputTokens: number;
  cacheWriteInputTokens: number;
}

export interface BedrockClientGenerateResponse {
  output: string;
  usage: TokenUsage;
}

/**
 * The result of executing an agent tool handler.
 *
 * Determines how the tool use loop proceeds:
 * - `result`: The content is fed back to the model as a successful tool
 *   result and the loop continues.
 * - `error`: The message is fed back to the model as a failed tool result
 *   so it can correct itself, and the loop continues.
 * - `done`: The tool completed the task and the loop terminates.
 */
export type ToolOutcome =
  | { kind: "result"; content: string }
  | { kind: "error"; message: string }
  | { kind: "done" };

/**
 * A tool that can be provided to the model during generation.
 *
 * Tools are defined by the caller and passed to the client, which knows
 * nothing about their semantics. The input schema is converted to JSON
 * Schema for the model and used to validate tool inputs before the
 * handler is invoked; validation failures are returned to the model as
 * error results so it can retry.
 */
export interface AgentTool<I = unknown> {
  /** Unique tool name presented to the model */
  name: string;

  /** Description of what the tool does, presented to the model */
  description: string;

  /** Zod schema describing and validating the tool input */
  inputSchema: z.ZodType<I>;

  /**
   * Executes the tool with validated input.
   *
   * @param input - Tool input validated against the input schema
   * @returns The outcome that determines how the loop proceeds
   */
  handler(input: I): Promise<ToolOutcome>;
}

export interface GenerateWithToolsOptions {
  /**
   * Name of a tool the model is required to call on the first turn.
   * Subsequent turns allow the model to choose freely.
   */
  forceTool?: string;

  /**
   * Require the model to call some tool (of its choice) on every turn,
   * preventing free-text responses. Ignored on the first turn when
   * forceTool is also set.
   */
  requireTool?: boolean;

  /** Maximum number of model turns before the loop fails (default: 10) */
  maxTurns?: number;

  /** Whether to enable prompt caching for supported models */
  cacheEnabled?: boolean;

  /**
   * Receives a message for each tool dispatch and loop transition,
   * for debugging tool use sessions.
   */
  onDebug?: (message: string) => void;
}

export interface GenerateWithToolsResponse {
  usage: TokenUsage;

  /**
   * How the loop terminated: `tool` when a tool handler returned a `done`
   * outcome, `end_turn` when the model finished without a terminal tool call.
   */
  stopReason: "tool" | "end_turn";
}

export interface BedrockClient {
  generate(
    prompt: Prompt,
    cacheEnabled: boolean,
  ): Promise<BedrockClientGenerateResponse>;

  generateWithTools(
    prompt: Prompt,
    tools: AgentTool[],
    options?: GenerateWithToolsOptions,
  ): Promise<GenerateWithToolsResponse>;
}
