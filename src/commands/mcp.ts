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
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Command } from "commander";
import z from "zod";
import { buildBestPracticesPrompt } from "../ai/prompts/bestPracticesPrompt.js";
import {
  buildContentSummaryPrompt,
  buildReviewAgentPrompt,
  buildTranslationAgentPrompt,
} from "../ai/prompts/index.js";
import { VERSION } from "../cli.js";
import { ConfigManager } from "../config/index.js";
import { MarkdownTree } from "../content/index.js";
import { Language } from "../languages/index.js";
import { ConsoleErrorLogger, NoopLogger } from "./logger.js";
import { commonOptions, languageOptions } from "./options.js";
import * as utils from "./utils.js";

export function createMcpCommand(): Command {
  const command = new Command("mcp");

  commonOptions(command);
  languageOptions(command);

  command.description("Runs an MCP server").action(executeAction);

  return command;
}

// biome-ignore lint/suspicious/noExplicitAny: Need a better way to handle CLI options
async function executeAction(options: any): Promise<void> {
  const logger = new ConsoleErrorLogger();

  logger.message("Starting MCP server...");

  const server = new McpServer({
    name: "toolkit-md-server",
    version: VERSION,
  });

  const noopLogger = new NoopLogger();

  const languages = [...Language.getLanguages().map((e) => e.code)].join(", ");

  const cwd = utils.getCwd(options);

  logger.message(`Working directory is: ${cwd}`);

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

      const exemplars = utils.getExemplars(projectDir, defaultLanguage, config);

      const styleGuides = utils.getStyleGuides(
        projectDir,
        config,
        defaultLanguage,
        noopLogger,
        languages,
      );

      const prompt = buildBestPracticesPrompt(language, styleGuides, exemplars);

      return { content: [{ type: "text", text: prompt }] };
    },
  );

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
      },
    },
    async ({ projectDirectory, language: sourceLanguage }) => {
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

      const tree = new MarkdownTree(
        contentDir ?? projectDir,
        defaultLanguage.code,
        projectDirectory,
      );

      const prompt = buildContentSummaryPrompt(
        tree,
        projectDirectory,
        contentDir,
        language,
        defaultLanguage,
        resolvedSourceLanguage,
      );

      return { content: [{ type: "text", text: prompt }] };
    },
  );

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

      let resolvedSourceDirectory: string | undefined;

      if (sourceDirectory) {
        resolvedSourceDirectory = path.join(contentDir, sourceDirectory);
      }

      const { language, defaultLanguage } = utils.getLanguages(config);

      const tree = new MarkdownTree(
        resolvedSourceDirectory ?? contentDir,
        defaultLanguage.code,
        projectDirectory,
      );

      var resolvedSourceLanguage: Language | undefined;

      if (sourceLanguage) {
        resolvedSourceLanguage = Language.getLanguage(sourceLanguage);
      } else {
        resolvedSourceLanguage = language;
      }

      if (!resolvedSourceLanguage) {
        throw new Error(`Invalid source language: ${sourceLanguage}`);
      }

      const styleGuides = utils.getStyleGuides(
        projectDir,
        config,
        defaultLanguage,
        noopLogger,
        [language, resolvedSourceLanguage],
      );

      const prompt = buildReviewAgentPrompt(
        tree,
        resolvedSourceLanguage,
        includeContentMap,
        styleGuides,
      );

      return { content: [{ type: "text", text: prompt.prompt }] };
    },
  );

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

      let resolvedSourceDirectory: string | undefined;

      if (sourceDirectory) {
        resolvedSourceDirectory = path.join(contentDir, sourceDirectory);
      }

      const { language, defaultLanguage } = utils.getLanguages(config);

      const tree = new MarkdownTree(
        resolvedSourceDirectory ?? contentDir,
        defaultLanguage.code,
        projectDirectory,
      );

      var resolvedSourceLanguage: Language | undefined;

      if (sourceLanguage) {
        resolvedSourceLanguage = Language.getLanguage(sourceLanguage);
      } else {
        resolvedSourceLanguage = language;
      }

      if (!resolvedSourceLanguage) {
        throw new Error(`Invalid source language: ${sourceLanguage}`);
      }

      var resolvedTargetLanguage: Language | undefined;

      if (targetLanguage) {
        resolvedTargetLanguage = Language.getLanguage(targetLanguage);
      }

      if (!resolvedTargetLanguage) {
        throw new Error(`Invalid target language: ${targetLanguage}`);
      }

      const styleGuides = utils.getStyleGuides(
        projectDir,
        config,
        defaultLanguage,
        noopLogger,
        [language, resolvedTargetLanguage],
      );

      const prompt = buildTranslationAgentPrompt(
        tree,
        language,
        resolvedTargetLanguage,
        includeSourceContentMap,
        styleGuides,
      );

      return { content: [{ type: "text", text: prompt.prompt }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
