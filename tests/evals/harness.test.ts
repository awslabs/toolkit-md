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
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { loadCase, loadCorpus } from "../../evals/caseLoader.js";
import {
  computePromptHashes,
  type HarnessOptions,
  runCase,
  runEval,
} from "../../evals/harness.js";
import type {
  AgentTool,
  BedrockClient,
  BedrockClientGenerateResponse,
  GenerateWithToolsOptions,
  GenerateWithToolsResponse,
  Prompt,
  TokenUsage,
} from "../../src/ai/index.js";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.resolve(TESTS_DIR, "..", "..", "evals", "corpus");

const usage: TokenUsage = {
  inputTokens: 10,
  outputTokens: 5,
  totalTokens: 15,
  estimatedTokens: 8,
  cacheReadInputTokens: 0,
  cacheWriteInputTokens: 0,
};

/**
 * Fake client that calls the forced/first write-style tool with content
 * derived from the prompt, mimicking a single-turn tool loop.
 */
class FakeBedrockClient implements BedrockClient {
  constructor(
    private readonly respondWith: (prompt: Prompt) => string | Error,
  ) {}

  async generate(): Promise<BedrockClientGenerateResponse> {
    throw new Error("not used in these tests");
  }

  async generateWithTools(
    prompt: Prompt,
    tools: AgentTool[],
    options?: GenerateWithToolsOptions,
  ): Promise<GenerateWithToolsResponse> {
    const response = this.respondWith(prompt);

    if (response instanceof Error) {
      throw response;
    }

    const writeTool = tools.find(
      (t) => t.name === (options?.forceTool ?? "write_file"),
    );

    if (!writeTool) {
      throw new Error("write tool not found");
    }

    const outcome = await writeTool.handler({
      path: "file.md",
      content: response,
    });

    if (outcome.kind === "done") {
      return { usage, stopReason: "tool" };
    }

    const finishTool = tools.find((t) => t.name.startsWith("finish_"));

    if (!finishTool) {
      throw new Error("finish tool not found");
    }

    await finishTool.handler({ summary: "done" });
    return { usage, stopReason: "tool" };
  }
}

function harnessOptions(client: BedrockClient): HarnessOptions {
  return {
    client,
    modelId: "fake-model",
    editModes: ["write"],
    repetitions: 1,
    rubric: "none",
    log: () => {},
  };
}

describe("loadCorpus", () => {
  test("loads the checked-in corpus", () => {
    const cases = loadCorpus(CORPUS_DIR);

    expect(cases.length).toBeGreaterThanOrEqual(8);
    expect(cases.every((c) => c.content.length > 0)).toBe(true);

    const ids = cases.map((c) => c.id);
    expect(ids).toContain("review/typos-basic");
    expect(ids).toContain("translate/retranslate-small-change");
  });

  test("filters by substring", () => {
    const cases = loadCorpus(CORPUS_DIR, "clean-file");
    expect(cases.length).toBe(1);
    expect(cases[0].id).toBe("review/clean-file");
  });

  test("rejects a directory without a manifest", () => {
    expect(() => loadCase(TESTS_DIR, TESTS_DIR)).toThrow(
      "Case manifest not found",
    );
  });

  test("loads style guides declared by a case", () => {
    const evalCase = loadCase(
      path.join(CORPUS_DIR, "review", "style-guide"),
      CORPUS_DIR,
    );

    expect(evalCase.styleGuides.length).toBe(1);
    expect(evalCase.styleGuides[0]).toContain(
      'Never use the abbreviation "k8s"',
    );
  });

  test("loads no style guides when a case declares none", () => {
    const evalCase = loadCase(
      path.join(CORPUS_DIR, "review", "clean-file"),
      CORPUS_DIR,
    );

    expect(evalCase.styleGuides).toEqual([]);
  });
});

describe("runCase (review)", () => {
  test("grades a review that fixes seeded errors", async () => {
    const evalCase = loadCase(
      path.join(CORPUS_DIR, "review", "typos-basic"),
      CORPUS_DIR,
    );

    const client = new FakeBedrockClient((prompt) => {
      const original = prompt.sampleOutput ?? "";
      return original
        .replace(/\brecieve\b/g, "receive")
        .replace(/\bseperate\b/g, "separate")
        .replace(/\bteh\b/g, "the")
        .replace(/\boccured\b/g, "occurred");
    });

    const result = await runCase(evalCase, "write", 0, harnessOptions(client));

    expect(result.failed).toBe(false);
    expect(result.scores.seededRecall).toBe(1);
    expect(result.scores.integrity).toBe(1);
    expect(result.scores.preservation).toBe(1);
    expect(result.scores.shouldNotChange).toBe(1);
    expect(result.scores.completion).toBe(1);
  });

  test("scores partial seeded recall and confirms the pipeline strips leaked tags", async () => {
    const evalCase = loadCase(
      path.join(CORPUS_DIR, "review", "typos-basic"),
      CORPUS_DIR,
    );

    const client = new FakeBedrockClient((prompt) => {
      const original = prompt.sampleOutput ?? "";
      return `${original.replace(/\brecieve\b/g, "receive")}</content>`;
    });

    const result = await runCase(evalCase, "write", 0, harnessOptions(client));

    expect(result.scores.integrity).toBe(1);
    expect(result.scores.seededRecall).toBe(0.25);
  });

  test("records a pipeline error as a failed result instead of throwing", async () => {
    const evalCase = loadCase(
      path.join(CORPUS_DIR, "review", "clean-file"),
      CORPUS_DIR,
    );

    const client = new FakeBedrockClient(
      () => new Error("Tool use loop did not complete within 10 turns"),
    );

    const result = await runCase(evalCase, "write", 0, harnessOptions(client));

    expect(result.failed).toBe(true);
    expect(result.errorMessage).toContain("did not complete");
    expect(result.scores.completion).toBe(0);
  });
});

describe("runCase (style guides)", () => {
  test("delivers case style guides to the model prompt", async () => {
    const evalCase = loadCase(
      path.join(CORPUS_DIR, "review", "style-guide"),
      CORPUS_DIR,
    );

    const seenContexts: string[] = [];

    const client = new FakeBedrockClient((prompt) => {
      seenContexts.push(prompt.context ?? "");
      const original = prompt.sampleOutput ?? "";
      return original
        .replace(/\bk8s\b/g, "Kubernetes")
        .replace(/click on/g, "choose")
        .replace(/\(e\.g\. /g, "(for example, ");
    });

    const result = await runCase(evalCase, "write", 0, harnessOptions(client));

    expect(
      seenContexts.some((c) => c.includes('Never use the abbreviation "k8s"')),
    ).toBe(true);
    expect(result.failed).toBe(false);
    expect(result.scores.seededRecall).toBe(1);
    expect(result.scores.preservation).toBe(1);
  });

  test("delivers case style guides to the translate prompt", async () => {
    const evalCase = loadCase(
      path.join(CORPUS_DIR, "translate", "style-guide"),
      CORPUS_DIR,
    );

    const seenContexts: string[] = [];

    const client = new FakeBedrockClient((prompt) => {
      seenContexts.push(prompt.context ?? "");
      const original = prompt.sampleOutput ?? "";
      return original
        .replace(/\bcluster\b/g, "grappe")
        .replace(/\bworker node\b/g, "nœud de travail");
    });

    const result = await runCase(evalCase, "write", 0, harnessOptions(client));

    expect(seenContexts.some((c) => c.includes("grappe"))).toBe(true);
    expect(result.failed).toBe(false);
    expect(result.scores.seededRecall).toBe(1);
    expect(result.scores.preservation).toBe(1);
    expect(result.scores.translationHash).toBe(1);
  });
});

describe("runCase (translate)", () => {
  test("grades a translation including hash management", async () => {
    const evalCase = loadCase(
      path.join(CORPUS_DIR, "translate", "new-translation"),
      CORPUS_DIR,
    );

    const client = new FakeBedrockClient((prompt) => {
      const original = prompt.sampleOutput ?? "";
      return original.replace(
        "# Wait for the rollout to finish before continuing",
        "# Attendez la fin du déploiement avant de continuer",
      );
    });

    const result = await runCase(evalCase, "write", 0, harnessOptions(client));

    expect(result.failed).toBe(false);
    expect(result.scores.translationHash).toBe(1);
    expect(result.scores.preservation).toBe(1);
  });

  test("detects the stale hash and retranslates only the changed file", async () => {
    const evalCase = loadCase(
      path.join(CORPUS_DIR, "translate", "retranslate-small-change"),
      CORPUS_DIR,
    );

    const client = new FakeBedrockClient((prompt) => prompt.sampleOutput ?? "");

    const result = await runCase(evalCase, "write", 0, harnessOptions(client));

    expect(result.failed).toBe(false);
    expect(result.counts.hashFilesChecked).toBe(1);
    expect(result.scores.translationHash).toBe(1);
  });
});

describe("runEval", () => {
  test("runs the matrix and stamps metadata", async () => {
    const cases = [
      loadCase(path.join(CORPUS_DIR, "review", "clean-file"), CORPUS_DIR),
    ];

    const client = new FakeBedrockClient((prompt) => prompt.sampleOutput ?? "");

    const artifact = await runEval(cases, {
      ...harnessOptions(client),
      editModes: ["write"],
      repetitions: 2,
    });

    expect(artifact.results.length).toBe(2);
    expect(artifact.metadata.modelId).toBe("fake-model");
    expect(artifact.metadata.toolkitVersion).not.toBe("unknown");
    expect(Object.keys(artifact.metadata.promptHashes).length).toBeGreaterThan(
      0,
    );
  });

  test("respects a case-pinned edit mode over the matrix", async () => {
    const cases = [
      loadCase(
        path.join(CORPUS_DIR, "translate", "new-translation"),
        CORPUS_DIR,
      ),
    ];

    const client = new FakeBedrockClient((prompt) => prompt.sampleOutput ?? "");

    const artifact = await runEval(cases, {
      ...harnessOptions(client),
      editModes: ["write", "edits"],
      repetitions: 1,
    });

    expect(artifact.results.length).toBe(1);
    expect(artifact.results[0].editMode).toBe("write");
  });
});

describe("computePromptHashes", () => {
  test("hashes the prompt template sources", () => {
    const hashes = computePromptHashes();
    expect(hashes["src/ai/prompts/reviewPrompt.ts"]).toMatch(/^[0-9a-f]{32}$/);
    expect(hashes["src/ai/prompts/translatePrompt.ts"]).toMatch(
      /^[0-9a-f]{32}$/,
    );
  });
});
