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

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildPath, Workspace } from "../../src/core/workspace.js";

describe("Workspace", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tkmd-workspace-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeConfig(config: Record<string, unknown>): void {
    fs.writeFileSync(
      path.join(tempDir, ".toolkit-mdrc.json"),
      JSON.stringify(config),
    );
  }

  test("should create a workspace with default languages", async () => {
    const workspace = await Workspace.create(tempDir);

    expect(workspace.cwd).toBe(tempDir);
    expect(workspace.language.code).toBe("en");
    expect(workspace.defaultLanguage.code).toBe("en");
  });

  test("should resolve languages from config file", async () => {
    writeConfig({ language: "fr", defaultLanguage: "en" });

    const workspace = await Workspace.create(tempDir);

    expect(workspace.language.code).toBe("fr");
    expect(workspace.defaultLanguage.code).toBe("en");
  });

  test("should give CLI options precedence over config file", async () => {
    writeConfig({ language: "fr" });

    const workspace = await Workspace.create(tempDir, {
      cliOptions: { language: "ja" },
    });

    expect(workspace.language.code).toBe("ja");
  });

  test("should return undefined content dir when not configured", async () => {
    const workspace = await Workspace.create(tempDir);

    expect(workspace.getContentDir()).toBeUndefined();
  });

  test("should resolve the configured content dir against the cwd", async () => {
    writeConfig({ contentDir: "content" });

    const workspace = await Workspace.create(tempDir);

    expect(workspace.getContentDir()).toBe(path.join(tempDir, "content"));
  });

  test("should join targets under the configured content dir", async () => {
    writeConfig({ contentDir: "content" });

    const workspace = await Workspace.create(tempDir);

    expect(workspace.getContentDirWithTarget("docs")).toBe(
      path.join(tempDir, "content", "docs"),
    );
  });

  test("should use the target directly when no content dir is configured", async () => {
    const workspace = await Workspace.create(tempDir);

    expect(workspace.getContentDirWithTarget("docs")).toBe(
      path.resolve(path.join(tempDir, "docs")),
    );
  });

  test("should default translation dir to the content dir", async () => {
    const workspace = await Workspace.create(tempDir);

    const contentDir = path.join(tempDir, "content");
    const result = workspace.getTranslationDir(contentDir);

    expect(result.translationDir).toBe(contentDir);
    expect(result.overridden).toBe(false);
  });

  test("should resolve an overridden translation dir", async () => {
    writeConfig({ ai: { translation: { directory: "i18n" } } });

    const workspace = await Workspace.create(tempDir);

    const result = workspace.getTranslationDir(path.join(tempDir, "content"));

    expect(result.translationDir).toBe(path.join(tempDir, "i18n"));
    expect(result.overridden).toBe(true);
  });

  test("should return the configured context strategy", async () => {
    writeConfig({ ai: { contextStrategy: "siblings" } });

    const workspace = await Workspace.create(tempDir);

    expect(workspace.getContextStrategy()).toBe("siblings");
  });

  test("should build a content tree from a directory", async () => {
    const contentDir = path.join(tempDir, "content");
    fs.mkdirSync(contentDir);
    fs.writeFileSync(path.join(contentDir, "guide.md"), "# Guide");
    fs.writeFileSync(path.join(contentDir, "guide.fr.md"), "# Guide FR");

    const workspace = await Workspace.create(tempDir);

    const tree = await workspace.buildTree(contentDir);
    const nodes = tree.getFlattenedTree();

    expect(nodes.length).toBe(1);
    expect(nodes[0].content).toBe("# Guide");
  });

  test("should build a tree with language overrides", async () => {
    const contentDir = path.join(tempDir, "content");
    fs.mkdirSync(contentDir);
    fs.writeFileSync(path.join(contentDir, "guide.md"), "# Guide");
    fs.writeFileSync(path.join(contentDir, "guide.fr.md"), "# Guide FR");

    const workspace = await Workspace.create(tempDir);
    const french = (await import("../../src/languages/index.js")).Language;

    const tree = await workspace.buildTree(contentDir, {
      language: french.getLanguage("fr"),
    });
    const nodes = tree.getFlattenedTree();

    expect(nodes.length).toBe(1);
    expect(nodes[0].content).toBe("# Guide FR");
  });

  test("should return empty exemplars and style guides by default", async () => {
    const workspace = await Workspace.create(tempDir);

    expect(await workspace.getExemplars()).toEqual([]);
    expect(await workspace.getStyleGuides()).toEqual([]);
  });

  test("should load style guides from files", async () => {
    fs.writeFileSync(path.join(tempDir, "style.md"), "Use formal language");
    writeConfig({ ai: { styleGuides: ["style.md"] } });

    const workspace = await Workspace.create(tempDir);

    expect(await workspace.getStyleGuides()).toEqual(["Use formal language"]);
  });

  test("should throw for a missing style guide", async () => {
    writeConfig({ ai: { styleGuides: ["missing.md"] } });

    const workspace = await Workspace.create(tempDir);

    await expect(workspace.getStyleGuides()).rejects.toThrow(
      "Failed to load style guide",
    );
  });

  test("should load exemplars as content trees", async () => {
    const exemplarDir = path.join(tempDir, "examples");
    fs.mkdirSync(exemplarDir);
    fs.writeFileSync(path.join(exemplarDir, "good.md"), "# Good Example");
    writeConfig({ ai: { exemplars: ["examples"] } });

    const workspace = await Workspace.create(tempDir);

    const exemplars = await workspace.getExemplars();

    expect(exemplars.length).toBe(1);
    expect(exemplars[0].path).toBe("examples");
    expect(exemplars[0].nodes.length).toBe(1);
    expect(exemplars[0].nodes[0].content).toBe("# Good Example");
  });
});

describe("buildPath", () => {
  test("should return undefined for empty input", () => {
    expect(buildPath(undefined, "/base")).toBeUndefined();
  });

  test("should join relative paths with the context", () => {
    expect(buildPath("docs/guide.md", "/base")).toBe("/base/docs/guide.md");
  });

  test("should leave absolute paths unchanged", () => {
    expect(buildPath("/abs/guide.md", "/base")).toBe("/abs/guide.md");
  });
});
