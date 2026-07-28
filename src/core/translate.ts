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
 * @fileoverview Translation pipeline service.
 *
 * Transport-agnostic implementation of the translate operation. Walks the
 * source content tree, determines which files require translation using
 * source content hashes, invokes the model through a forced write_file
 * tool call, and applies results to the target tree. Emits progress events
 * rather than writing to the terminal so it can be driven by the CLI, MCP
 * server, or tests.
 */

import type {
  BedrockClient,
  ContextStrategy,
  Exemplar,
  TokenUsage,
} from "../ai/index.js";
import {
  buildTranslatePrompt,
  TRANSLATE_WRITE_TOOL_NAME,
} from "../ai/prompts/translatePrompt.js";
import {
  type ContentNode,
  type ContentTree,
  LEGACY_TRANSLATION_SRC_HASH_KEY,
  setTranslationSourceHash,
  TRANSLATION_SRC_HASH_KEY,
} from "../content/index.js";
import type { Language } from "../languages/index.js";
import {
  FINISH_TRANSLATION_TOOL_NAME,
  runFileEditSession,
} from "./fileEditSession.js";
import { generateFileContent } from "./fileWriteTool.js";

export type TranslationEditMode = "write" | "edits";

export interface TranslateServiceOptions {
  /** Tree containing the source language content */
  sourceTree: ContentTree;

  /** Tree containing existing translations, receives new translations */
  targetTree: ContentTree;

  /** Model client used for translation */
  client: BedrockClient;

  /** Language of the source content */
  sourceLanguage: Language;

  /** Language to translate into */
  targetLanguage: Language;

  /** Strategy for including sibling content in prompts */
  contextStrategy: ContextStrategy;

  /** Style guide contents to include in prompts */
  styleGuides: string[];

  /** Exemplar content to include in prompts */
  exemplars: Exemplar[];

  /** Translate files even when the source hash is unchanged */
  force: boolean;

  /** Only report which files require translation without translating */
  checkOnly: boolean;

  /** Write translations to the target tree */
  write: boolean;

  /** Whether to enable prompt caching */
  cacheEnabled: boolean;

  /**
   * How the model updates existing translations (default: whole-file
   * write). New translations always use whole-file write since every
   * line is new content.
   */
  editMode?: TranslationEditMode;

  /** Receives per-turn tool dispatch messages for debugging */
  onDebug?: (message: string) => void;
}

/**
 * Progress events emitted while the translation pipeline runs.
 *
 * - `skipped`: The file's translation is up to date.
 * - `translating`: Model generation is starting for a file.
 * - `translation-required`: Check-only mode found a file needing translation.
 * - `translated`: A file was translated; `written` indicates persistence.
 * - `no-content`: The source node had no content for the source language.
 * - `orphan`: A translation exists with no matching source file; `removed`
 *   indicates whether it was cleaned up (write mode) or only reported.
 */
export type TranslateEvent =
  | { kind: "skipped"; node: ContentNode }
  | { kind: "translating"; node: ContentNode }
  | { kind: "translation-required"; node: ContentNode }
  | {
      kind: "translated";
      node: ContentNode;
      targetNode: ContentNode | null;
      output: string;
      written: boolean;
      usage: TokenUsage;
    }
  | { kind: "no-content"; node: ContentNode }
  | { kind: "orphan"; path: string; removed: boolean };

export interface TranslateResult {
  /** Whether any file required translation or cleanup */
  changeDetected: boolean;
}

function getExistingTranslationHash(
  targetNode: ContentNode | null,
): string | undefined {
  if (!targetNode?.frontmatter) {
    return undefined;
  }

  if (TRANSLATION_SRC_HASH_KEY in targetNode.frontmatter) {
    return targetNode.frontmatter[TRANSLATION_SRC_HASH_KEY] as string;
  }

  if (LEGACY_TRANSLATION_SRC_HASH_KEY in targetNode.frontmatter) {
    return targetNode.frontmatter[LEGACY_TRANSLATION_SRC_HASH_KEY] as string;
  }

  return undefined;
}

/**
 * Runs the translation pipeline over the source tree.
 *
 * Files whose stored source hash matches the current source content are
 * skipped unless `force` is set. In check-only mode, files requiring
 * translation are reported without invoking the model. Translations for
 * source files that no longer exist are reported as orphans and removed
 * in write mode.
 *
 * @param options - Pipeline inputs and behavior flags
 * @param onEvent - Callback invoked for each progress event
 * @returns Summary indicating whether any changes were detected
 */
export async function translateContent(
  options: TranslateServiceOptions,
  onEvent: (event: TranslateEvent) => void,
): Promise<TranslateResult> {
  const {
    sourceTree,
    targetTree,
    client,
    sourceLanguage,
    targetLanguage,
    contextStrategy,
    styleGuides,
    exemplars,
    force,
    checkOnly,
    write,
    cacheEnabled,
    editMode = "write",
    onDebug,
  } = options;

  const nodes = sourceTree.getFlattenedTree();

  const orphanedTargetPaths = new Set(
    targetTree
      .getNodes()
      .filter((e) => !e.isDirectory)
      .map((e) => e.path),
  );

  let changeDetected = false;

  for (const node of nodes) {
    orphanedTargetPaths.delete(node.path);

    if (!node.content) {
      onEvent({ kind: "no-content", node });
      continue;
    }

    const targetNode = targetTree.getNode(node.path);
    const existingTranslation = targetNode?.content;

    if (!force && existingTranslation) {
      const existingTranslationHash = getExistingTranslationHash(targetNode);

      if (existingTranslationHash && existingTranslationHash === node.hash) {
        onEvent({ kind: "skipped", node });
        continue;
      }
    }

    changeDetected = true;

    if (checkOnly) {
      onEvent({ kind: "translation-required", node });
      continue;
    }

    onEvent({ kind: "translating", node });

    const useEdits = editMode === "edits" && Boolean(existingTranslation);

    const prompt = buildTranslatePrompt(sourceTree, node, {
      existingTranslation: targetNode || undefined,
      sourceLanguage,
      targetLanguage,
      contextStrategy,
      styleGuides,
      exemplars,
      editMode: useEdits,
    });

    let output: string;
    let usage: TokenUsage;

    if (useEdits && existingTranslation) {
      const session = await runFileEditSession(client, prompt, {
        filePath: node.filePath,
        originalContent: existingTranslation,
        cacheEnabled,
        finishToolName: FINISH_TRANSLATION_TOOL_NAME,
        finishToolDescription:
          "Completes the translation update. Call this after the existing translation fully reflects the current source content.",
        onDebug,
      });

      output = session.content;
      usage = session.usage;
    } else {
      const generated = await generateFileContent(client, prompt, {
        toolName: TRANSLATE_WRITE_TOOL_NAME,
        toolDescription:
          "Writes the complete translated content for the file being translated",
        cacheEnabled,
        filePath: node.filePath,
        originalContent: node.content,
        onDebug,
      });

      output = generated.content;
      usage = generated.usage;
    }

    if (node.hash) {
      output = setTranslationSourceHash(output, node.hash);
    }

    let writtenNode = targetNode;

    if (write) {
      if (!writtenNode) {
        writtenNode = await targetTree.create(node.path, output);
      } else {
        await targetTree.updateContent(writtenNode, output);
      }
    }

    onEvent({
      kind: "translated",
      node,
      targetNode: writtenNode,
      output,
      written: write,
      usage,
    });
  }

  for (const orphanPath of orphanedTargetPaths) {
    changeDetected = true;

    if (write) {
      await targetTree.delete(orphanPath);
    }

    onEvent({ kind: "orphan", path: orphanPath, removed: write });
  }

  return { changeDetected };
}
