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
import * as path from "node:path";
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
  CONFIG_REVIEW_DIFF_CONTEXT,
  CONFIG_REVIEW_DIFF_FILE,
  CONFIG_REVIEW_INSTRUCTIONS,
  CONFIG_REVIEW_SUMMARY_PATH,
  ConfigManager,
} from "../config/index.js";
import {
  filterDiffByChangedLines,
  type ParsedDiff,
  parseUnifiedDiff,
} from "../content/utils/diffUtils.js";
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
  utils.optionForConfigSchema(command, CONFIG_REVIEW_DIFF_FILE);
  utils.optionForConfigSchema(command, CONFIG_REVIEW_DIFF_CONTEXT);
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

  const diffFile = config.get<string | undefined>("ai.review.diffFile");
  const diffContext = config.get<number>("ai.review.diffContext");

  if (diffFile && write) {
    throw new Error(
      "Cannot use --write with --diff-file. Diff-based review is read-only for safety.",
    );
  }

  if (diffFile && summaryPath.length === 0) {
    throw new Error(
      "Must provide --summary-file when using --diff-file.",
    );
  }

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

  let parsedDiff: ParsedDiff | null = null;
  if (diffFile) {
    const diffContent = fs.readFileSync(
      utils.buildPath(diffFile, cwd),
      "utf-8",
    );
    parsedDiff = parseUnifiedDiff(
      diffContent,
      path.relative(config.getCwd(), contentDir),
    );

    const diffFiles = Object.keys(parsedDiff);
    for (const diffFilePath of diffFiles) {
      const normalizedDiffPath = path.normalize(diffFilePath);
      const fileExists = nodes.some((node) => {
        const nodePath = node.filePath || node.path;
        return path.normalize(nodePath).endsWith(normalizedDiffPath);
      });

      if (!fileExists) {
        throw new Error(
          `File ${diffFilePath} from diff not found in content tree`,
        );
      }
    }
  }

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
      const nodePath = node.filePath || node.path;

      if (parsedDiff) {
        const normalizedNodePath = path.normalize(nodePath);
        const isInDiff = Object.keys(parsedDiff).some((diffFilePath) => {
          const normalizedDiffPath = path.normalize(diffFilePath);
          return normalizedNodePath.endsWith(normalizedDiffPath);
        });

        if (!isInDiff) {
          continue;
        }
      }

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

      let aiDiff = createPatch(nodePath, node.content, response.output);

      if (parsedDiff) {
        const normalizedNodePath = path.normalize(nodePath);
        const diffFilePath = Object.keys(parsedDiff).find((diffPath) => {
          const normalizedDiffPath = path.normalize(diffPath);
          return normalizedNodePath.endsWith(normalizedDiffPath);
        });

        if (diffFilePath) {
          const changedRanges = parsedDiff[diffFilePath];
          aiDiff = filterDiffByChangedLines(aiDiff, changedRanges, diffContext);

          if (aiDiff === "") {
            console.log(`⏭️  Skipped ${nodePath} (no relevant suggestions)\n`);
            continue;
          }
        }
      }

      diffs.push({
        path: nodePath,
        diff: aiDiff,
      });

      if (write) {
        await tree.updateContent(node, response.output);

        console.log(`📜 Wrote to file ${node.filePath}`);
      } else if (!parsedDiff) {
        utils.displayDiff(node.content, response.output);
      }

      console.log(`\n💰 ${utils.printTokenUsage(response.usage)}\n`);
    }
  }

  if (summaryPath.length > 0) {
    const summaryPrompt = buildSummarizePrompt(diffs);

    await utils.withSpinner(`Writing summary to ${summaryPath}`, async () => {
      const response = await client.generate(summaryPrompt);

      let summaryContent = response.output;

      if (parsedDiff) {
        summaryContent = `> **Note:** This summary was generated using diff-based filtering. Only suggestions overlapping with changes in the provided diff file are included.\n\n${summaryContent}`;
      }

      fs.writeFileSync(
        utils.buildPath(summaryPath, cwd),
        summaryContent,
        "utf-8",
      );
    });
  }
}
