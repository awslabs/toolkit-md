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

import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";
import * as utils from "../../commands/utils.js";
import { ConfigManager } from "../../config/index.js";
import { Language } from "../../languages/index.js";
import { buildTranslationAgentPrompt } from "../prompts/index.js";
import type { ToolContext } from "./types.js";

export function registerTranslationGuidanceTool(
  server: McpServer,
  context: ToolContext,
): void {
  const { cwd, languages, noopLogger, options } = context;

  server.registerTool(
    "content_translation_guidance",
    {
      title: "Markdown Content Translation Guidance",
      description:
        "Provides guidance and instructions for translating Markdown content for the specified project from one language to another. The response will include a content map of the target language.",
      inputSchema: {
        projectDirectory: z
          .string()
          .describe("Absolute path to base/root directory of the project"),
        sourceDirectory: z
          .string()
          .describe(
            "Optional relative path to a sub-directory under the project content directory as specified by the content map. Use this to translate a specific sub-directory, otherwise guidance will apply to all content in the project.",
          )
          .optional(),
        language: z
          .string()
          .describe(
            `Source language for translating the content. If omitted then the projects default language will be used. Can be one of: ${languages}`,
          )
          .optional(),
        targetLanguage: z
          .string()
          .describe(
            `Target language if translating the content, can be one of: ${languages}`,
          ),
        includeSourceContentMap: z
          .boolean()
          .describe(
            `Whether to include a content map of the source language files. This is not necessary if a content map has already been retrieved.`,
          )
          .default(false),
      },
    },
    async ({
      projectDirectory,
      language: sourceLanguage,
      targetLanguage,
      includeSourceContentMap,
      sourceDirectory,
    }) => {
      utils.validatePathWithinCwd(projectDirectory, cwd);
      const config = new ConfigManager(projectDirectory);
      await config.initialize(options);

      const projectDir = path.resolve(projectDirectory);

      const contentDir = utils.getContentDir(config) || projectDir;

      const resolvedSourceDirectory = sourceDirectory
        ? path.join(contentDir, sourceDirectory)
        : contentDir;
      const resolvedTargetDirectory = utils.getTranslationDir(
        config,
        resolvedSourceDirectory,
      );

      const { language, defaultLanguage } = utils.getLanguages(config);

      var resolvedSourceLanguage: Language | undefined;

      if (sourceLanguage) {
        resolvedSourceLanguage = Language.getLanguage(sourceLanguage);
      } else {
        resolvedSourceLanguage = language;
      }

      if (!resolvedSourceLanguage) {
        throw new Error(`Invalid source language: ${sourceLanguage}`);
      }

      const sourceTree = await utils.buildContentTree(
        resolvedSourceDirectory,
        defaultLanguage,
        resolvedSourceLanguage,
      );

      var resolvedTargetLanguage: Language | undefined;

      if (targetLanguage) {
        resolvedTargetLanguage = Language.getLanguage(targetLanguage);
      }

      if (!resolvedTargetLanguage) {
        throw new Error(`Invalid target language: ${targetLanguage}`);
      }

      const targetTree = await utils.buildContentTree(
        resolvedSourceDirectory ?? projectDir,
        defaultLanguage,
        resolvedTargetLanguage,
      );

      const styleGuides = await utils.getStyleGuides(
        projectDir,
        config,
        defaultLanguage,
        noopLogger,
        [language, resolvedTargetLanguage],
      );

      const prompt = buildTranslationAgentPrompt(
        sourceTree,
        targetTree,
        resolvedSourceLanguage,
        resolvedTargetLanguage,
        includeSourceContentMap,
        resolvedSourceDirectory,
        resolvedTargetDirectory.translationDir,
        styleGuides,
      );

      return { content: [{ type: "text" as const, text: prompt.prompt }] };
    },
  );
}
