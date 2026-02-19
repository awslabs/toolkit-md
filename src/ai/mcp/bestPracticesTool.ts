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
import { buildBestPracticesPrompt } from "../prompts/bestPracticesPrompt.js";
import type { ToolContext } from "./types.js";

export function registerBestPracticesTool(
  server: McpServer,
  context: ToolContext,
): void {
  const { cwd, languages, noopLogger, options } = context;

  server.registerTool(
    "content_best_practices",
    {
      title: "Markdown Content Best Practices",
      description:
        "Provides style guides and best practice examples for creating and reviewing Markdown content for the specified project",
      inputSchema: {
        projectDirectory: z
          .string()
          .describe("Absolute path to base/root directory of the project"),
        targetLanguage: z
          .string()
          .describe(
            `Target language if translating the content, omit this if not intending to translate. Can be one of: ${languages}`,
          )
          .optional(),
      },
    },
    async ({ projectDirectory, targetLanguage }) => {
      utils.validatePathWithinCwd(projectDirectory, cwd);
      const config = new ConfigManager(projectDirectory);
      await config.initialize(options);

      const projectDir = path.resolve(projectDirectory);

      const { language, defaultLanguage } = utils.getLanguages(config);

      const languages = [language];

      if (targetLanguage) {
        const resolvedTargetLanguage = Language.getLanguage(targetLanguage);

        if (!resolvedTargetLanguage) {
          throw new Error(`Invalid target language: ${targetLanguage}`);
        }

        languages.push(resolvedTargetLanguage);
      }

      const exemplars = await utils.getExemplars(
        projectDir,
        defaultLanguage,
        language,
        config,
      );

      const styleGuides = await utils.getStyleGuides(
        projectDir,
        config,
        defaultLanguage,
        noopLogger,
        languages,
      );

      const prompt = buildBestPracticesPrompt(language, styleGuides, exemplars);

      return { content: [{ type: "text" as const, text: prompt }] };
    },
  );
}
