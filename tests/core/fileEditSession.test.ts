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
import type {
  AgentTool,
  BedrockClient,
  BedrockClientGenerateResponse,
  GenerateWithToolsOptions,
  GenerateWithToolsResponse,
  Prompt,
  TokenUsage,
  ToolOutcome,
} from "../../src/ai/index.js";
import {
  applyEdits,
  runFileEditSession,
} from "../../src/core/fileEditSession.js";
import { stripTrailingArgumentTag } from "../../src/core/fileWriteTool.js";

const emptyUsage: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  estimatedTokens: 0,
  cacheReadInputTokens: 0,
  cacheWriteInputTokens: 0,
};

interface ScriptedCall {
  tool: string;
  input: unknown;
}

/**
 * Fake BedrockClient that replays a scripted sequence of tool calls,
 * mimicking the real loop's dispatch and outcome handling.
 */
class ScriptedClient implements BedrockClient {
  public outcomes: ToolOutcome[] = [];
  public options?: GenerateWithToolsOptions;

  constructor(private readonly script: ScriptedCall[]) {}

  async generate(): Promise<BedrockClientGenerateResponse> {
    throw new Error("not used");
  }

  async generateWithTools(
    _prompt: Prompt,
    tools: AgentTool[],
    options?: GenerateWithToolsOptions,
  ): Promise<GenerateWithToolsResponse> {
    this.options = options;

    for (const call of this.script) {
      const tool = tools.find((t) => t.name === call.tool);

      if (!tool) {
        throw new Error(`Unknown scripted tool: ${call.tool}`);
      }

      const parsed = tool.inputSchema.safeParse(call.input);

      if (!parsed.success) {
        this.outcomes.push({
          kind: "error",
          message: parsed.error.message,
        });
        continue;
      }

      const outcome = await tool.handler(parsed.data);
      this.outcomes.push(outcome);

      if (outcome.kind === "done") {
        return { usage: emptyUsage, stopReason: "tool" };
      }
    }

    return { usage: emptyUsage, stopReason: "end_turn" };
  }
}

describe("applyEdits", () => {
  test("should apply a single edit", () => {
    const result = applyEdits("Hello world", [
      { oldText: "world", newText: "there" },
    ]);
    expect(result).toBe("Hello there");
  });

  test("should apply multiple edits in order", () => {
    const result = applyEdits("one two three", [
      { oldText: "one", newText: "1" },
      { oldText: "three", newText: "3" },
    ]);
    expect(result).toBe("1 two 3");
  });

  test("should allow later edits to build on earlier ones", () => {
    const result = applyEdits("aaa", [
      { oldText: "aaa", newText: "bbb" },
      { oldText: "bbb", newText: "ccc" },
    ]);
    expect(result).toBe("ccc");
  });

  test("should throw when oldText is not found", () => {
    expect(() =>
      applyEdits("Hello world", [{ oldText: "missing", newText: "x" }]),
    ).toThrow("Edit 1: oldText not found");
  });

  test("should throw when oldText is ambiguous", () => {
    expect(() =>
      applyEdits("dup text dup", [{ oldText: "dup", newText: "x" }]),
    ).toThrow("appears more than once");
  });
});

describe("stripTrailingArgumentTag", () => {
  test("should strip a leaked trailing content tag", () => {
    expect(stripTrailingArgumentTag("# Guide\nText\n</content>")).toBe(
      "# Guide\nText\n",
    );
  });

  test("should strip with surrounding whitespace", () => {
    expect(stripTrailingArgumentTag("# Guide\n\n  </content>  \n")).toBe(
      "# Guide\n",
    );
  });

  test("should leave clean content untouched", () => {
    expect(stripTrailingArgumentTag("# Guide\nText\n")).toBe("# Guide\nText\n");
  });

  test("should not strip other closing tags", () => {
    expect(stripTrailingArgumentTag("Text</details>")).toBe("Text</details>");
  });

  test("should preserve the tag when the original ended with it", () => {
    expect(
      stripTrailingArgumentTag("New text\n</content>", "Old text\n</content>"),
    ).toBe("New text\n</content>");
  });

  test("should strip when the original did not end with it", () => {
    expect(stripTrailingArgumentTag("New text\n</content>", "Old text\n")).toBe(
      "New text\n",
    );
  });
});

describe("runFileEditSession", () => {
  const original = "# Title\n\nSome paragraph.\n\nAnother paragraph.\n";

  test("should apply edits and finish with changed content", async () => {
    const client = new ScriptedClient([
      {
        tool: "edit_file",
        input: {
          edits: [{ oldText: "Some paragraph.", newText: "A paragraph." }],
        },
      },
      { tool: "finish_review", input: { summary: "Simplified wording" } },
    ]);

    const result = await runFileEditSession(
      client,
      { prompt: "Review" },
      { filePath: "guide.md", originalContent: original, cacheEnabled: false },
    );

    expect(result.changed).toBe(true);
    expect(result.content).toBe(
      "# Title\n\nA paragraph.\n\nAnother paragraph.\n",
    );
    expect(result.summary).toBe("Simplified wording");
    expect(client.options?.requireTool).toBe(true);
    expect(client.options?.forceTool).toBeUndefined();
  });

  test("should report unchanged when the model finishes immediately", async () => {
    const client = new ScriptedClient([
      { tool: "finish_review", input: { summary: "No changes needed" } },
    ]);

    const result = await runFileEditSession(
      client,
      { prompt: "Review" },
      { filePath: "guide.md", originalContent: original, cacheEnabled: false },
    );

    expect(result.changed).toBe(false);
    expect(result.content).toBe(original);
    expect(result.summary).toBe("No changes needed");
  });

  test("should feed edit failures back as errors and allow retry", async () => {
    const client = new ScriptedClient([
      {
        tool: "edit_file",
        input: { edits: [{ oldText: "not in the file", newText: "x" }] },
      },
      {
        tool: "edit_file",
        input: { edits: [{ oldText: "# Title", newText: "# Heading" }] },
      },
      { tool: "finish_review", input: { summary: "Fixed heading" } },
    ]);

    const result = await runFileEditSession(
      client,
      { prompt: "Review" },
      { filePath: "guide.md", originalContent: original, cacheEnabled: false },
    );

    expect(client.outcomes[0]).toEqual({
      kind: "error",
      message: expect.stringContaining("oldText not found"),
    });
    expect(result.changed).toBe(true);
    expect(result.content).toContain("# Heading");
  });

  test("should not surface partial content from a failed batch", async () => {
    const client = new ScriptedClient([
      {
        tool: "edit_file",
        input: {
          edits: [
            { oldText: "# Title", newText: "# Heading" },
            { oldText: "does not exist", newText: "x" },
          ],
        },
      },
      { tool: "finish_review", input: { summary: "Done" } },
    ]);

    const result = await runFileEditSession(
      client,
      { prompt: "Review" },
      { filePath: "guide.md", originalContent: original, cacheEnabled: false },
    );

    expect(result.content).toBe(original);
    expect(result.changed).toBe(false);
  });

  test("should support whole-file rewrite via write_file", async () => {
    const client = new ScriptedClient([
      {
        tool: "write_file",
        input: { path: "guide.md", content: "# Rewritten\n" },
      },
      { tool: "finish_review", input: { summary: "Rewrote the page" } },
    ]);

    const result = await runFileEditSession(
      client,
      { prompt: "Review" },
      { filePath: "guide.md", originalContent: original, cacheEnabled: false },
    );

    expect(result.changed).toBe(true);
    expect(result.content).toBe("# Rewritten\n");
  });

  test("should sanitize leaked closing tags in write_file rewrites", async () => {
    const client = new ScriptedClient([
      {
        tool: "write_file",
        input: { path: "guide.md", content: "# Rewritten\n</content>" },
      },
      { tool: "finish_review", input: { summary: "Rewrote the page" } },
    ]);

    const result = await runFileEditSession(
      client,
      { prompt: "Review" },
      { filePath: "guide.md", originalContent: original, cacheEnabled: false },
    );

    expect(result.content).toBe("# Rewritten\n");
  });

  test("should use a custom finish tool name", async () => {
    const client = new ScriptedClient([
      { tool: "finish_translation", input: { summary: "Updated" } },
    ]);

    const result = await runFileEditSession(
      client,
      { prompt: "Translate" },
      {
        filePath: "guide.fr.md",
        originalContent: original,
        cacheEnabled: false,
        finishToolName: "finish_translation",
      },
    );

    expect(result.summary).toBe("Updated");
  });

  test("should reject finish when validation fails and accept after correction", async () => {
    const client = new ScriptedClient([
      { tool: "finish_review", input: { summary: "Done" } },
      {
        tool: "edit_file",
        input: { edits: [{ oldText: "# Title", newText: "# Required" }] },
      },
      { tool: "finish_review", input: { summary: "Done properly" } },
    ]);

    const result = await runFileEditSession(
      client,
      { prompt: "Review" },
      {
        filePath: "guide.md",
        originalContent: original,
        cacheEnabled: false,
        validateResult: (content) =>
          content.includes("# Required")
            ? null
            : "The heading must be updated to '# Required' before finishing.",
      },
    );

    expect(client.outcomes[0]).toEqual({
      kind: "error",
      message: expect.stringContaining("must be updated"),
    });
    expect(result.summary).toBe("Done properly");
    expect(result.content).toContain("# Required");
  });

  test("should throw when the session ends without finish_review", async () => {
    const client = new ScriptedClient([
      {
        tool: "edit_file",
        input: { edits: [{ oldText: "# Title", newText: "# Heading" }] },
      },
    ]);

    await expect(
      runFileEditSession(
        client,
        { prompt: "Review" },
        {
          filePath: "guide.md",
          originalContent: original,
          cacheEnabled: false,
        },
      ),
    ).rejects.toThrow("without calling finish_review");
  });
});
