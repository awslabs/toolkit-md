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
import { Command } from "commander";
import { createPatch } from "diff";
import {
  buildReviewPrompt,
  buildSummarizePrompt,
  DefaultBedrockClient,
  type FileDiff,
} from "../ai/index.js";
import {
  CONFIG_IMAGE_BASE_PATH,
  CONFIG_INCLUDE_IMAGES,
  CONFIG_MAX_IMAGE_SIZE,
  CONFIG_MAX_IMAGES,
  CONFIG_REVIEW_INSTRUCTIONS,
  CONFIG_REVIEW_SUMMARY_PATH,
  ConfigManager,
} from "../config/index.js";
import type { LogWriter } from "./logger.js";
import { logo } from "./logo.js";
import {
  commonAiOptions,
  contextOptions,
  exemplarOption,
  fileWriteOptions,
  languageOptions,
  styleGuideOption,
} from "./options.js";
import * as utils from "./utils.js";

export function createReviewCommand(): Command {
  const command = new Command("review");

  commonAiOptions(command);
  fileWriteOptions(command);
  languageOptions(command);
  exemplarOption(command);
  styleGuideOption(command);
  contextOptions(command);

  command
    .argument("<content>", "file path to content to review")
    .description("Reviews the given content")
    .action(utils.withErrorHandling("Review", executeAction));

  utils.optionForConfigSchema(command, CONFIG_REVIEW_SUMMARY_PATH);
  utils.optionForConfigSchema(command, CONFIG_REVIEW_INSTRUCTIONS);
  utils.optionForConfigSchema(command, CONFIG_INCLUDE_IMAGES);
  utils.optionForConfigSchema(command, CONFIG_IMAGE_BASE_PATH);
  utils.optionForConfigSchema(command, CONFIG_MAX_IMAGES);
  utils.optionForConfigSchema(command, CONFIG_MAX_IMAGE_SIZE);

  return command;
}

async function executeAction(
  content: string,
  // biome-ignore lint/suspicious/noExplicitAny: Need a better way to handle CLI options
  options: any,
  logger: LogWriter,
): Promise<void> {
  logo();

  console.log("Reviewing content...");

  const cwd = utils.getCwd(options);

  const config = new ConfigManager(cwd);
  await config.initialize(options);

  const { language, defaultLanguage } = utils.getLanguages(config);

  const { model, maxTokens } = utils.getCommonAiOptions(config, logger);

  const { requestRate, tokenRate } = utils.getRateLimitOptions(config, logger);

  const write = utils.getWriteOption(config);

  const contextStrategy = utils.getContextStrategy(config);

  const exemplars = await utils.getExemplars(
    cwd,
    defaultLanguage,
    language,
    config,
  );

  const styleGuides = await utils.getStyleGuides(
    cwd,
    config,
    defaultLanguage,
    logger,
    [language],
  );

  const summaryPath = config.get<string>("ai.review.summaryPath");

  const instructions = config.get<string | undefined>("ai.review.instructions");

  console.log("\n");

  const contentDir = utils.getContentDirWithTarget(config, content);

  const includeImages = config.get<boolean>("ai.includeImages");
  const imageBasePath = utils.getImageBasePath(config);
  const maxImages = config.get<number>("ai.maxImages");
  const maxImageSize = config.get<number>("ai.maxImageSize");

  const tree = await utils.buildContentTree(
    contentDir,
    defaultLanguage,
    language,
  );

  const nodes = tree.getFlattenedTree();

  const client = new DefaultBedrockClient(
    model,
    maxTokens,
    requestRate,
    tokenRate,
    5,
  );

  const diffs: FileDiff[] = [];

  for (const node of nodes) {
    if (node.content) {
      const prompt = await buildReviewPrompt(
        tree,
        node,
        language,
        contextStrategy,
        styleGuides,
        exemplars,
        imageBasePath,
        instructions,
        includeImages,
        maxImages,
        maxImageSize,
      );

      const { response } = await utils.withSpinner(
        `Processing ${node.filePath}`,
        async () => {
          return { response: await client.generate(prompt) };
        },
      );

      diffs.push({
        path: node.filePath || node.path,
        diff: createPatch(
          node.filePath || node.path,
          node.content,
          response.output,
        ),
      });

      if (write) {
        await tree.updateContent(node, response.output);

        console.log(`📜 Wrote to file ${node.filePath}`);
      } else {
        utils.displayDiff(node.content, response.output);
      }

      console.log(`\n💰 ${utils.printTokenUsage(response.usage)}\n`);
    }
  }

  if (summaryPath.length > 0) {
    const summaryPrompt = buildSummarizePrompt(diffs);

    await utils.withSpinner(`Writing summary to ${summaryPath}`, async () => {
      const response = await client.generate(summaryPrompt);

      fs.writeFileSync(
        utils.buildPath(summaryPath, cwd),
        response.output,
        "utf-8",
      );
    });
  }
}
