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
import { buildReviewAgentPrompt } from "../prompts/index.js";
import type { ToolContext } from "./types.js";

export function registerReviewGuidanceTool(
  server: McpServer,
  context: ToolContext,
): void {
  const { cwd, languages, noopLogger, options } = context;

  server.registerTool(
    "content_review_guidance",
    {
      title: "Markdown Content Review Guidance",
      description:
        "Provides guidance and instructions for reviewing Markdown content for the specified project for various issues and best practices. The response will include a content map of the project.",
      inputSchema: {
        projectDirectory: z
          .string()
          .describe("Absolute path to base/root directory of the project"),
        sourceDirectory: z
          .string()
          .describe(
            "Optional relative path to a sub-directory under the project content directory as specified by the content map. Use this to review a specific sub-directory, otherwise guidance will apply to all content in the project.",
          )
          .optional(),
        language: z
          .string()
          .describe(
            `Source language for reviewing the content. If omitted then the projects default language will be used. Can be one of: ${languages}`,
          )
          .optional(),
        includeContentMap: z
          .boolean()
          .describe(
            `Whether to include a content map of the Markdown files. This is not necessary if a content map has already been retrieved.`,
          )
          .default(false),
      },
    },
    async ({
      projectDirectory,
      language: sourceLanguage,
      includeContentMap,
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

      const tree = await utils.buildContentTree(
        resolvedSourceDirectory ?? projectDir,
        defaultLanguage,
        resolvedSourceLanguage,
      );

      const styleGuides = await utils.getStyleGuides(
        projectDir,
        config,
        defaultLanguage,
        noopLogger,
        [language, resolvedSourceLanguage],
      );

      const prompt = buildReviewAgentPrompt(
        tree,
        resolvedSourceLanguage,
        resolvedSourceDirectory,
        includeContentMap,
        styleGuides,
      );

      return { content: [{ type: "text" as const, text: prompt.prompt }] };
    },
  );
}
