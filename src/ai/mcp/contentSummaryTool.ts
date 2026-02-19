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
import { buildContentSummaryPrompt } from "../prompts/index.js";
import type { ToolContext } from "./types.js";

export function registerContentSummaryTool(
  server: McpServer,
  context: ToolContext,
): void {
  const { cwd, languages, options } = context;

  server.registerTool(
    "content_summary_information",
    {
      title: "Markdown Content Summary Information",
      description: `Provides an overview of various information related to Markdown content in the specified project.
      
This information maybe useful by itself, but is often required by other tools. 

For example some of the information it returns is:

- The content directory path, which is a sub-directory under the project directory where Markdown is located
- The default language configuration of the project
- A content map of the Markdown files in a project which can be used to get an overview of the content in the project
      
The content map provides an ordered file/directory structure map of the Markdown content for the specified project.
File paths are relative to the specified project directory.
The title of the Markdown files are parsed from frontmatter if present.
Use this tool to get a summary of the Markdown content in a project or locate files related to a specific topic.`,
      inputSchema: {
        projectDirectory: z
          .string()
          .describe("Absolute path to base/root directory of the project"),
        language: z
          .string()
          .describe(
            `Language for which to generate the content map. If omitted then the projects default language will be used. Can be one of: ${languages}`,
          )
          .optional(),
        includeImages: z
          .boolean()
          .describe(
            "Include paths for images referenced in each content file in the map",
          )
          .optional()
          .default(false),
      },
    },
    async ({ projectDirectory, language: sourceLanguage, includeImages }) => {
      utils.validatePathWithinCwd(projectDirectory, cwd);

      const config = new ConfigManager(projectDirectory);
      await config.initialize(options);

      const projectDir = path.resolve(projectDirectory);

      const contentDir = utils.getContentDir(config);

      if (contentDir) {
        utils.validatePathWithinCwd(contentDir, cwd);
      }

      const { language, defaultLanguage } = utils.getLanguages(config);

      var resolvedSourceLanguage: Language | undefined = language;

      if (sourceLanguage) {
        resolvedSourceLanguage = Language.getLanguage(sourceLanguage);
      } else {
        resolvedSourceLanguage = language;
      }

      if (!resolvedSourceLanguage) {
        throw new Error(`Invalid source language: ${sourceLanguage}`);
      }

      const tree = await utils.buildContentTree(
        contentDir ?? projectDir,
        defaultLanguage,
        language,
      );

      const prompt = buildContentSummaryPrompt(
        tree,
        projectDirectory,
        contentDir,
        language,
        defaultLanguage,
        resolvedSourceLanguage,
        includeImages,
      );

      return { content: [{ type: "text" as const, text: prompt }] };
    },
  );
}
