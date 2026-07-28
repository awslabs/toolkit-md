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
} from "../../src/ai/index.js";
import { ContentTree, MockProvider } from "../../src/content/index.js";
import type { ParsedDiff } from "../../src/content/utils/diffUtils.js";
import {
  type ReviewEvent,
  type ReviewServiceOptions,
  reviewContent,
  summarizeReview,
  validateDiffFiles,
} from "../../src/core/review.js";
import { Language } from "../../src/languages/index.js";

const english = Language.getLanguage("en") as Language;

const emptyUsage: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  estimatedTokens: 0,
  cacheReadInputTokens: 0,
  cacheWriteInputTokens: 0,
};

/**
 * Fake BedrockClient that drives the write_file tool with content produced
 * per prompt, mimicking the real tool use loop's forced tool call behavior.
 */
class FakeBedrockClient implements BedrockClient {
  public toolCalls: Prompt[] = [];
  public generateCalls: Prompt[] = [];

  constructor(
    private readonly respondWith: (prompt: Prompt) => string,
    private readonly generateResponse: string = "summary",
  ) {}

  async generate(prompt: Prompt): Promise<BedrockClientGenerateResponse> {
    this.generateCalls.push(prompt);
    return { output: this.generateResponse, usage: emptyUsage };
  }

  async generateWithTools(
    prompt: Prompt,
    tools: AgentTool[],
    options?: GenerateWithToolsOptions,
  ): Promise<GenerateWithToolsResponse> {
    this.toolCalls.push(prompt);

    const tool = tools.find((t) => t.name === options?.forceTool);

    if (!tool) {
      throw new Error("Expected forced tool to be provided");
    }

    const input = tool.inputSchema.parse({
      path: "reviewed.md",
      content: this.respondWith(prompt),
    });

    const outcome = await tool.handler(input);

    if (outcome.kind !== "done") {
      throw new Error(`Expected done outcome, got ${outcome.kind}`);
    }

    return { usage: emptyUsage, stopReason: "tool" };
  }
}

function buildTree(
  entries: Array<{ path: string; content: string }>,
  provider = new MockProvider(entries),
): { tree: ContentTree; provider: MockProvider } {
  const tree = new ContentTree(provider, {
    defaultLanguage: "en",
    language: "en",
  });
  entries.forEach(({ path, content }) => tree.add(path, content));
  return { tree, provider };
}

function serviceOptions(
  overrides: Partial<ReviewServiceOptions> &
    Pick<ReviewServiceOptions, "tree" | "client">,
): ReviewServiceOptions {
  return {
    language: english,
    contextStrategy: "nothing",
    styleGuides: [],
    exemplars: [],
    diffContext: 3,
    write: false,
    includeImages: false,
    maxImages: 5,
    maxImageSize: 3145728,
    cacheEnabled: false,
    ...overrides,
  };
}

async function run(
  options: ReviewServiceOptions,
): Promise<{ events: ReviewEvent[]; diffs: { path: string; diff: string }[] }> {
  const events: ReviewEvent[] = [];
  const result = await reviewContent(options, (event) => events.push(event));
  return { events, diffs: result.diffs };
}

describe("reviewContent", () => {
  test("should review a file and produce a diff without writing", async () => {
    const { tree, provider } = buildTree([
      { path: "guide.md", content: "# Guide\nOriginal text" },
    ]);

    const client = new FakeBedrockClient(() => "# Guide\nImproved text");

    const { events, diffs } = await run(serviceOptions({ tree, client }));

    expect(diffs.length).toBe(1);
    expect(diffs[0].diff).toContain("-Original text");
    expect(diffs[0].diff).toContain("+Improved text");

    const reviewed = events.filter((e) => e.kind === "reviewed");
    expect(reviewed.length).toBe(1);
    expect(reviewed[0].written).toBe(false);
    expect(reviewed[0].original).toBe("# Guide\nOriginal text");
    expect(reviewed[0].revised).toBe("# Guide\nImproved text");

    const entries = await provider.loadContent();
    expect(entries[0].content).toBe("# Guide\nOriginal text");
  });

  test("should write revised content in write mode", async () => {
    const { tree, provider } = buildTree([
      { path: "guide.md", content: "# Guide\nOriginal text" },
    ]);

    const client = new FakeBedrockClient(() => "# Guide\nImproved text");

    const { events } = await run(serviceOptions({ tree, client, write: true }));

    const reviewed = events.filter((e) => e.kind === "reviewed");
    expect(reviewed[0].written).toBe(true);

    const entries = await provider.loadContent();
    expect(entries[0].content).toBe("# Guide\nImproved text");
  });

  test("should review every content file in the tree", async () => {
    const { tree } = buildTree([
      { path: "a.md", content: "# A" },
      { path: "b.md", content: "# B" },
    ]);

    const client = new FakeBedrockClient((prompt) =>
      prompt.sampleOutput === "# A" ? "# A improved" : "# B improved",
    );

    const { diffs } = await run(serviceOptions({ tree, client }));

    expect(diffs.length).toBe(2);
    expect(client.toolCalls.length).toBe(2);
  });

  test("should only review files present in the parsed diff", async () => {
    const { tree } = buildTree([
      { path: "a.md", content: "# A\nLine two" },
      { path: "b.md", content: "# B\nLine two" },
    ]);

    const parsedDiff: ParsedDiff = {
      "a.md": [{ start: 2, end: 2 }],
    };

    const client = new FakeBedrockClient(() => "# A\nLine two improved");

    const { diffs } = await run(serviceOptions({ tree, client, parsedDiff }));

    expect(client.toolCalls.length).toBe(1);
    expect(diffs.length).toBe(1);
    expect(diffs[0].path).toBe("a.md");
  });

  test("should skip files when diff filtering removes all suggestions", async () => {
    const content = ["# Title", "Line two", "Line three", "Line four"].join(
      "\n",
    );
    const { tree } = buildTree([{ path: "a.md", content }]);

    const revised = [
      "# Title",
      "Line two",
      "Line three",
      "Line four changed",
    ].join("\n");

    const parsedDiff: ParsedDiff = {
      "a.md": [{ start: 1, end: 1 }],
    };

    const client = new FakeBedrockClient(() => revised);

    const { events, diffs } = await run(
      serviceOptions({ tree, client, parsedDiff, diffContext: 0 }),
    );

    expect(diffs.length).toBe(0);
    expect(events.filter((e) => e.kind === "no-suggestions").length).toBe(1);
  });

  test("should throw when a diff file is missing from the tree", async () => {
    const { tree } = buildTree([{ path: "a.md", content: "# A" }]);

    const parsedDiff: ParsedDiff = {
      "missing.md": [{ start: 1, end: 1 }],
    };

    const client = new FakeBedrockClient(() => "# A");

    await expect(
      run(serviceOptions({ tree, client, parsedDiff })),
    ).rejects.toThrow("File missing.md from diff not found in content tree");
  });

  test("should skip nodes without content", async () => {
    const { tree } = buildTree([
      { path: "a.md", content: "# A" },
      { path: "sub/b.md", content: "# B" },
    ]);

    const client = new FakeBedrockClient(() => "# improved");

    await run(serviceOptions({ tree, client }));

    expect(client.toolCalls.length).toBe(2);
  });

  test("should emit reviewing before reviewed for each file", async () => {
    const { tree } = buildTree([{ path: "a.md", content: "# A" }]);

    const client = new FakeBedrockClient(() => "# A improved");

    const { events } = await run(serviceOptions({ tree, client }));

    expect(events.map((e) => e.kind)).toEqual(["reviewing", "reviewed"]);
  });
});

describe("reviewContent in edits mode", () => {
  class EditModeClient implements BedrockClient {
    constructor(
      private readonly script: Array<{ tool: string; input: unknown }>,
    ) {}

    async generate(): Promise<BedrockClientGenerateResponse> {
      throw new Error("not used");
    }

    async generateWithTools(
      _prompt: Prompt,
      tools: AgentTool[],
      _options?: GenerateWithToolsOptions,
    ): Promise<GenerateWithToolsResponse> {
      for (const call of this.script) {
        const tool = tools.find((t) => t.name === call.tool);
        if (!tool) {
          throw new Error(`Unknown tool ${call.tool}`);
        }
        const outcome = await tool.handler(tool.inputSchema.parse(call.input));
        if (outcome.kind === "done") {
          return { usage: emptyUsage, stopReason: "tool" };
        }
      }
      return { usage: emptyUsage, stopReason: "end_turn" };
    }
  }

  test("should produce a diff from targeted edits and write in write mode", async () => {
    const { tree, provider } = buildTree([
      { path: "guide.md", content: "# Guide\nOriginal text" },
    ]);

    const client = new EditModeClient([
      {
        tool: "edit_file",
        input: {
          edits: [{ oldText: "Original text", newText: "Improved text" }],
        },
      },
      { tool: "finish_review", input: { summary: "Improved wording" } },
    ]);

    const { events, diffs } = await run(
      serviceOptions({ tree, client, write: true, editMode: "edits" }),
    );

    expect(diffs.length).toBe(1);
    expect(diffs[0].diff).toContain("-Original text");
    expect(diffs[0].diff).toContain("+Improved text");

    const reviewed = events.filter((e) => e.kind === "reviewed");
    expect(reviewed.length).toBe(1);
    expect(reviewed[0].revised).toBe("# Guide\nImproved text");
    expect(reviewed[0].written).toBe(true);

    const entries = await provider.loadContent();
    expect(entries[0].content).toBe("# Guide\nImproved text");
  });

  test("should emit unchanged and skip diffs when the model makes no edits", async () => {
    const { tree, provider } = buildTree([
      { path: "guide.md", content: "# Guide\nAlready perfect" },
    ]);

    const client = new EditModeClient([
      { tool: "finish_review", input: { summary: "No changes needed" } },
    ]);

    const { events, diffs } = await run(
      serviceOptions({ tree, client, write: true, editMode: "edits" }),
    );

    expect(diffs.length).toBe(0);
    expect(events.map((e) => e.kind)).toEqual(["reviewing", "unchanged"]);

    const unchanged = events.find((e) => e.kind === "unchanged");
    expect(unchanged?.summary).toBe("No changes needed");

    const entries = await provider.loadContent();
    expect(entries[0].content).toBe("# Guide\nAlready perfect");
  });
});

describe("validateDiffFiles", () => {
  test("should accept diff paths that suffix-match node paths", () => {
    const { tree } = buildTree([{ path: "docs/guide.md", content: "# Guide" }]);

    expect(() =>
      validateDiffFiles(
        { "guide.md": [{ start: 1, end: 1 }] },
        tree.getFlattenedTree(),
      ),
    ).not.toThrow();
  });
});

describe("summarizeReview", () => {
  test("should return the model summary", async () => {
    const client = new FakeBedrockClient(() => "", "the summary");

    const summary = await summarizeReview(
      client,
      [{ path: "a.md", diff: "diff" }],
      false,
    );

    expect(summary).toBe("the summary");
    expect(client.generateCalls.length).toBe(1);
  });

  test("should prepend a note when diff filtering was applied", async () => {
    const client = new FakeBedrockClient(() => "", "the summary");

    const summary = await summarizeReview(
      client,
      [{ path: "a.md", diff: "diff" }],
      true,
    );

    expect(summary).toContain("diff-based filtering");
    expect(summary).toContain("the summary");
  });
});
