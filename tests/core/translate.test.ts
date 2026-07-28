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
import {
  ContentTree,
  MockProvider,
  TRANSLATION_SRC_HASH_KEY,
} from "../../src/content/index.js";
import { setTranslationSourceHash } from "../../src/content/utils/markdownUtils.js";
import {
  type TranslateEvent,
  type TranslateServiceOptions,
  translateContent,
} from "../../src/core/translate.js";
import { Language } from "../../src/languages/index.js";

const english = Language.getLanguage("en") as Language;
const french = Language.getLanguage("fr") as Language;

const emptyUsage: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  estimatedTokens: 0,
  cacheReadInputTokens: 0,
  cacheWriteInputTokens: 0,
};

interface RecordedCall {
  prompt: Prompt;
  options?: GenerateWithToolsOptions;
}

/**
 * Fake BedrockClient that drives the write_file tool with canned content,
 * mimicking the real tool use loop's forced tool call behavior.
 */
class FakeBedrockClient implements BedrockClient {
  public calls: RecordedCall[] = [];

  constructor(private readonly respondWith: (prompt: Prompt) => string) {}

  async generate(): Promise<BedrockClientGenerateResponse> {
    throw new Error("generate should not be called by the translate service");
  }

  async generateWithTools(
    prompt: Prompt,
    tools: AgentTool[],
    options?: GenerateWithToolsOptions,
  ): Promise<GenerateWithToolsResponse> {
    this.calls.push({ prompt, options });

    const tool = tools.find((t) => t.name === options?.forceTool);

    if (!tool) {
      throw new Error(`Expected forced tool to be provided`);
    }

    const input = tool.inputSchema.parse({
      path: "translated.md",
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
  language: string,
  entries: Array<{ path: string; content: string }>,
  provider = new MockProvider(entries),
): { tree: ContentTree; provider: MockProvider } {
  const tree = new ContentTree(provider, {
    defaultLanguage: "en",
    language,
  });
  entries.forEach(({ path, content }) => tree.add(path, content));
  return { tree, provider };
}

function serviceOptions(
  overrides: Partial<TranslateServiceOptions> &
    Pick<TranslateServiceOptions, "sourceTree" | "targetTree" | "client">,
): TranslateServiceOptions {
  return {
    sourceLanguage: english,
    targetLanguage: french,
    contextStrategy: "nothing",
    styleGuides: [],
    exemplars: [],
    force: false,
    checkOnly: false,
    write: true,
    cacheEnabled: false,
    ...overrides,
  };
}

async function run(
  options: TranslateServiceOptions,
): Promise<{ events: TranslateEvent[]; changeDetected: boolean }> {
  const events: TranslateEvent[] = [];
  const result = await translateContent(options, (event) => events.push(event));
  return { events, changeDetected: result.changeDetected };
}

describe("translateContent", () => {
  test("should translate a new file and write it to the target tree", async () => {
    const { tree: sourceTree } = buildTree("en", [
      { path: "guide.md", content: "# Guide\nHello" },
    ]);
    const targetProvider = new MockProvider();
    const { tree: targetTree } = buildTree("fr", [], targetProvider);

    const client = new FakeBedrockClient(() => "# Guide FR\nBonjour");

    const { events, changeDetected } = await run(
      serviceOptions({ sourceTree, targetTree, client }),
    );

    expect(changeDetected).toBe(true);

    const sourceHash = sourceTree.getNode("guide")?.hash;
    const translated = events.filter((e) => e.kind === "translated");
    expect(translated.length).toBe(1);
    expect(translated[0].written).toBe(true);
    expect(translated[0].output).toBe(
      `---\n${TRANSLATION_SRC_HASH_KEY}: ${sourceHash}\n---\n# Guide FR\nBonjour`,
    );

    expect(targetProvider.has("guide.fr.md")).toBe(true);

    expect(client.calls.length).toBe(1);
    expect(client.calls[0].options?.forceTool).toBe("write_file");
  });

  test("should skip files whose stored source hash matches", async () => {
    const { tree: sourceTree } = buildTree("en", [
      { path: "guide.md", content: "# Guide\nHello" },
    ]);

    const sourceHash = sourceTree.getNode("guide")?.hash;
    expect(sourceHash).toBeTruthy();

    const { tree: targetTree } = buildTree("fr", [
      {
        path: "guide.fr.md",
        content: `---\n${TRANSLATION_SRC_HASH_KEY}: ${sourceHash}\n---\n# Guide FR`,
      },
    ]);

    const client = new FakeBedrockClient(() => {
      throw new Error("Model should not be invoked for up-to-date files");
    });

    const { events, changeDetected } = await run(
      serviceOptions({ sourceTree, targetTree, client }),
    );

    expect(changeDetected).toBe(false);
    expect(events.map((e) => e.kind)).toEqual(["skipped"]);
  });

  test("should re-translate when the source hash differs", async () => {
    const { tree: sourceTree } = buildTree("en", [
      { path: "guide.md", content: "# Guide\nUpdated content" },
    ]);

    const { tree: targetTree } = buildTree("fr", [
      {
        path: "guide.fr.md",
        content: `---\n${TRANSLATION_SRC_HASH_KEY}: stale-hash\n---\n# Guide FR`,
      },
    ]);

    const client = new FakeBedrockClient(() => "# Guide FR\nContenu");

    const { events } = await run(
      serviceOptions({ sourceTree, targetTree, client }),
    );

    const translated = events.filter((e) => e.kind === "translated");
    expect(translated.length).toBe(1);
    expect(client.calls.length).toBe(1);
  });

  test("should honor the legacy source hash key", async () => {
    const { tree: sourceTree } = buildTree("en", [
      { path: "guide.md", content: "# Guide\nHello" },
    ]);

    const sourceHash = sourceTree.getNode("guide")?.hash;

    const { tree: targetTree } = buildTree("fr", [
      {
        path: "guide.fr.md",
        content: `---\nwsmSourceHash: ${sourceHash}\n---\n# Guide FR`,
      },
    ]);

    const client = new FakeBedrockClient(() => {
      throw new Error("Model should not be invoked");
    });

    const { events } = await run(
      serviceOptions({ sourceTree, targetTree, client }),
    );

    expect(events.map((e) => e.kind)).toEqual(["skipped"]);
  });

  test("should translate unchanged files when force is set", async () => {
    const { tree: sourceTree } = buildTree("en", [
      { path: "guide.md", content: "# Guide\nHello" },
    ]);

    const sourceHash = sourceTree.getNode("guide")?.hash;

    const { tree: targetTree } = buildTree("fr", [
      {
        path: "guide.fr.md",
        content: `---\n${TRANSLATION_SRC_HASH_KEY}: ${sourceHash}\n---\n# Guide FR`,
      },
    ]);

    const client = new FakeBedrockClient(() => "# Guide FR\nBonjour");

    const { events } = await run(
      serviceOptions({ sourceTree, targetTree, client, force: true }),
    );

    expect(events.filter((e) => e.kind === "translated").length).toBe(1);
  });

  test("should update the existing target node instead of creating a new one", async () => {
    const { tree: sourceTree } = buildTree("en", [
      { path: "guide.md", content: "# Guide\nNew content" },
    ]);

    const targetProvider = new MockProvider([
      {
        path: "guide.fr.md",
        content: `---\n${TRANSLATION_SRC_HASH_KEY}: old\n---\n# Ancien`,
      },
    ]);
    const { tree: targetTree } = buildTree(
      "fr",
      [
        {
          path: "guide.fr.md",
          content: `---\n${TRANSLATION_SRC_HASH_KEY}: old\n---\n# Ancien`,
        },
      ],
      targetProvider,
    );

    const client = new FakeBedrockClient(() => "# Nouveau");

    await run(serviceOptions({ sourceTree, targetTree, client }));

    const entries = await targetProvider.loadContent();
    const guide = entries.find((e) => e.path === "guide.fr.md");
    expect(guide?.content).toContain("# Nouveau");
    expect(guide?.content).toContain(`${TRANSLATION_SRC_HASH_KEY}: `);
    expect(targetProvider.size()).toBe(1);
  });

  test("should report translation-required without invoking the model in check mode", async () => {
    const { tree: sourceTree } = buildTree("en", [
      { path: "guide.md", content: "# Guide\nHello" },
    ]);
    const { tree: targetTree } = buildTree("fr", []);

    const client = new FakeBedrockClient(() => {
      throw new Error("Model should not be invoked in check mode");
    });

    const { events, changeDetected } = await run(
      serviceOptions({ sourceTree, targetTree, client, checkOnly: true }),
    );

    expect(changeDetected).toBe(true);
    expect(events.map((e) => e.kind)).toEqual(["translation-required"]);
    expect(client.calls.length).toBe(0);
  });

  test("should not write translations when write is disabled", async () => {
    const { tree: sourceTree } = buildTree("en", [
      { path: "guide.md", content: "# Guide\nHello" },
    ]);
    const targetProvider = new MockProvider();
    const { tree: targetTree } = buildTree("fr", [], targetProvider);

    const client = new FakeBedrockClient(() => "# Guide FR");

    const { events } = await run(
      serviceOptions({ sourceTree, targetTree, client, write: false }),
    );

    const translated = events.filter((e) => e.kind === "translated");
    expect(translated.length).toBe(1);
    expect(translated[0].written).toBe(false);
    expect(translated[0].output).toContain("# Guide FR");
    expect(translated[0].output).toContain(`${TRANSLATION_SRC_HASH_KEY}: `);
    expect(targetProvider.size()).toBe(0);
  });

  test("should remove orphaned translations in write mode", async () => {
    const { tree: sourceTree } = buildTree("en", [
      { path: "guide.md", content: "# Guide\nHello" },
    ]);

    const orphanContent = `---\n${TRANSLATION_SRC_HASH_KEY}: x\n---\n# Orphelin`;
    const targetProvider = new MockProvider([
      { path: "removed.fr.md", content: orphanContent },
    ]);
    const { tree: targetTree } = buildTree(
      "fr",
      [{ path: "removed.fr.md", content: orphanContent }],
      targetProvider,
    );

    const client = new FakeBedrockClient(() => "# Guide FR");

    const { events, changeDetected } = await run(
      serviceOptions({ sourceTree, targetTree, client }),
    );

    expect(changeDetected).toBe(true);

    const orphans = events.filter((e) => e.kind === "orphan");
    expect(orphans).toEqual([
      { kind: "orphan", path: "removed", removed: true },
    ]);
    expect(targetProvider.has("removed.fr.md")).toBe(false);
  });

  test("should only report orphaned translations when write is disabled", async () => {
    const { tree: sourceTree } = buildTree("en", []);

    const orphanContent = "# Orphelin";
    const targetProvider = new MockProvider([
      { path: "removed.fr.md", content: orphanContent },
    ]);
    const { tree: targetTree } = buildTree(
      "fr",
      [{ path: "removed.fr.md", content: orphanContent }],
      targetProvider,
    );

    const client = new FakeBedrockClient(() => "unused");

    const { events } = await run(
      serviceOptions({ sourceTree, targetTree, client, write: false }),
    );

    expect(events).toEqual([
      { kind: "orphan", path: "removed", removed: false },
    ]);
    expect(targetProvider.has("removed.fr.md")).toBe(true);
  });

  test("should signal check mode failures for orphans as change detected", async () => {
    const { tree: sourceTree } = buildTree("en", []);
    const { tree: targetTree } = buildTree("fr", [
      { path: "removed.fr.md", content: "# Orphelin" },
    ]);

    const client = new FakeBedrockClient(() => "unused");

    const { changeDetected } = await run(
      serviceOptions({
        sourceTree,
        targetTree,
        client,
        checkOnly: true,
        write: false,
      }),
    );

    expect(changeDetected).toBe(true);
  });

  test("should throw when the model provides no content", async () => {
    const { tree: sourceTree } = buildTree("en", [
      { path: "guide.md", content: "# Guide\nHello" },
    ]);
    const { tree: targetTree } = buildTree("fr", []);

    const client: BedrockClient = {
      generate: async () => {
        throw new Error("not used");
      },
      generateWithTools: async () => ({
        usage: emptyUsage,
        stopReason: "end_turn",
      }),
    };

    await expect(
      run(serviceOptions({ sourceTree, targetTree, client })),
    ).rejects.toThrow("Model did not provide file content");
  });

  test("should emit translating events before invoking the model", async () => {
    const { tree: sourceTree } = buildTree("en", [
      { path: "guide.md", content: "# Guide\nHello" },
    ]);
    const { tree: targetTree } = buildTree("fr", []);

    const client = new FakeBedrockClient(() => "# Guide FR");

    const { events } = await run(
      serviceOptions({ sourceTree, targetTree, client }),
    );

    expect(events.map((e) => e.kind)).toEqual(["translating", "translated"]);
  });
});

describe("setTranslationSourceHash", () => {
  test("should replace an existing hash entry", () => {
    const content = `---\ntitle: Guide\n${TRANSLATION_SRC_HASH_KEY}: stale\n---\n# Guide FR`;

    expect(setTranslationSourceHash(content, "abc123")).toBe(
      `---\ntitle: Guide\n${TRANSLATION_SRC_HASH_KEY}: abc123\n---\n# Guide FR`,
    );
  });

  test("should replace a quoted hash entry", () => {
    const content = `---\n${TRANSLATION_SRC_HASH_KEY}: "stale"\n---\n# Guide FR`;

    expect(setTranslationSourceHash(content, "abc123")).toBe(
      `---\n${TRANSLATION_SRC_HASH_KEY}: abc123\n---\n# Guide FR`,
    );
  });

  test("should replace the legacy hash key", () => {
    const content = `---\nwsmSourceHash: stale\ntitle: Guide\n---\n# Guide FR`;

    expect(setTranslationSourceHash(content, "abc123")).toBe(
      `---\ntitle: Guide\n${TRANSLATION_SRC_HASH_KEY}: abc123\n---\n# Guide FR`,
    );
  });

  test("should append to existing frontmatter without a hash", () => {
    const content = `---\ntitle: Guide\n---\n# Guide FR`;

    expect(setTranslationSourceHash(content, "abc123")).toBe(
      `---\ntitle: Guide\n${TRANSLATION_SRC_HASH_KEY}: abc123\n---\n# Guide FR`,
    );
  });

  test("should create frontmatter when none exists", () => {
    expect(setTranslationSourceHash("# Guide FR", "abc123")).toBe(
      `---\n${TRANSLATION_SRC_HASH_KEY}: abc123\n---\n# Guide FR`,
    );
  });

  test("should collapse duplicate hash entries", () => {
    const content = `---\n${TRANSLATION_SRC_HASH_KEY}: stale\nwsmSourceHash: older\n---\n# Guide FR`;

    expect(setTranslationSourceHash(content, "abc123")).toBe(
      `---\n${TRANSLATION_SRC_HASH_KEY}: abc123\n---\n# Guide FR`,
    );
  });
});

describe("translateContent in edits mode", () => {
  class EditModeClient implements BedrockClient {
    public sessionCalls = 0;
    public writeCalls = 0;

    constructor(
      private readonly script: Array<{ tool: string; input: unknown }>,
    ) {}

    async generate(): Promise<BedrockClientGenerateResponse> {
      throw new Error("not used");
    }

    async generateWithTools(
      _prompt: Prompt,
      tools: AgentTool[],
      options?: GenerateWithToolsOptions,
    ): Promise<GenerateWithToolsResponse> {
      if (options?.forceTool) {
        this.writeCalls++;

        const tool = tools.find((t) => t.name === options.forceTool);
        if (!tool) {
          throw new Error("Expected forced tool");
        }
        await tool.handler(
          tool.inputSchema.parse({
            path: "guide.fr.md",
            content: "# Guide FR (new)",
          }),
        );
        return { usage: emptyUsage, stopReason: "tool" };
      }

      this.sessionCalls++;

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

  test("should update an existing translation via targeted edits", async () => {
    const { tree: sourceTree } = buildTree("en", [
      { path: "guide.md", content: "# Guide\nUpdated content" },
    ]);

    const sourceHash = sourceTree.getNode("guide")?.hash as string;

    const existing = `---\n${TRANSLATION_SRC_HASH_KEY}: stale-hash\n---\n# Guide FR\nAncien contenu`;
    const targetProvider = new MockProvider([
      { path: "guide.fr.md", content: existing },
    ]);
    const { tree: targetTree } = buildTree(
      "fr",
      [{ path: "guide.fr.md", content: existing }],
      targetProvider,
    );

    const client = new EditModeClient([
      {
        tool: "edit_file",
        input: {
          edits: [{ oldText: "Ancien contenu", newText: "Contenu mis à jour" }],
        },
      },
      {
        tool: "finish_translation",
        input: { summary: "Updated changed paragraph" },
      },
    ]);

    const { events } = await run(
      serviceOptions({ sourceTree, targetTree, client, editMode: "edits" }),
    );

    expect(client.sessionCalls).toBe(1);
    expect(client.writeCalls).toBe(0);

    const translated = events.filter((e) => e.kind === "translated");
    expect(translated.length).toBe(1);
    expect(translated[0].output).toContain("Contenu mis à jour");
    expect(translated[0].output).toContain(
      `${TRANSLATION_SRC_HASH_KEY}: ${sourceHash}`,
    );

    const entries = await targetProvider.loadContent();
    expect(entries[0].content).toContain("Contenu mis à jour");
  });

  test("should update the source hash automatically even when the model does not", async () => {
    const { tree: sourceTree } = buildTree("en", [
      { path: "guide.md", content: "# Guide\nUpdated content" },
    ]);

    const sourceHash = sourceTree.getNode("guide")?.hash as string;

    const existing = `---\n${TRANSLATION_SRC_HASH_KEY}: stale-hash\n---\n# Guide FR\nAncien`;
    const { tree: targetTree } = buildTree("fr", [
      { path: "guide.fr.md", content: existing },
    ]);

    const client = new EditModeClient([
      {
        tool: "edit_file",
        input: { edits: [{ oldText: "Ancien", newText: "Nouveau" }] },
      },
      { tool: "finish_translation", input: { summary: "Done" } },
    ]);

    const { events } = await run(
      serviceOptions({ sourceTree, targetTree, client, editMode: "edits" }),
    );

    const translated = events.filter((e) => e.kind === "translated");
    expect(translated.length).toBe(1);
    expect(translated[0].output).toContain(
      `${TRANSLATION_SRC_HASH_KEY}: ${sourceHash}`,
    );
    expect(translated[0].output).not.toContain("stale-hash");
  });

  test("should fall back to whole-file write for new translations", async () => {
    const { tree: sourceTree } = buildTree("en", [
      { path: "guide.md", content: "# Guide\nHello" },
    ]);
    const targetProvider = new MockProvider();
    const { tree: targetTree } = buildTree("fr", [], targetProvider);

    const client = new EditModeClient([]);

    const { events } = await run(
      serviceOptions({ sourceTree, targetTree, client, editMode: "edits" }),
    );

    expect(client.writeCalls).toBe(1);
    expect(client.sessionCalls).toBe(0);

    const translated = events.filter((e) => e.kind === "translated");
    expect(translated.length).toBe(1);
    expect(targetProvider.has("guide.fr.md")).toBe(true);
  });
});
