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
import { DefaultBedrockClient } from "../ai/index.js";
import {
  CONFIG_EDIT_MODE,
  CONFIG_INCLUDE_IMAGES,
  CONFIG_MAX_IMAGE_SIZE,
  CONFIG_MAX_IMAGES,
  CONFIG_REVIEW_CHECK,
  CONFIG_REVIEW_DIFF_CONTEXT,
  CONFIG_REVIEW_DIFF_FILE,
  CONFIG_REVIEW_INSTRUCTIONS,
  CONFIG_REVIEW_SUMMARY_PATH,
  CONFIG_STATIC_DIR,
  CONFIG_STATIC_PREFIX,
} from "../config/index.js";
import {
  type ParsedDiff,
  parseUnifiedDiff,
} from "../content/utils/diffUtils.js";
import type { LogWriter } from "../core/logger.js";
import {
  type ReviewEvent,
  reviewContent,
  summarizeReview,
} from "../core/review.js";
import { shouldEnableCache, Workspace } from "../core/workspace.js";
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
  utils.optionForConfigSchema(command, CONFIG_REVIEW_CHECK);
  utils.optionForConfigSchema(command, CONFIG_EDIT_MODE);
  utils.optionForConfigSchema(command, CONFIG_INCLUDE_IMAGES);
  utils.optionForConfigSchema(command, CONFIG_MAX_IMAGES);
  utils.optionForConfigSchema(command, CONFIG_MAX_IMAGE_SIZE);
  utils.optionForConfigSchema(command, CONFIG_STATIC_PREFIX);
  utils.optionForConfigSchema(command, CONFIG_STATIC_DIR);

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

  const workspace = await Workspace.create(cwd, {
    cliOptions: options,
    logger,
  });

  const { language, settings } = workspace;

  const { model, maxTokens } = utils.getCommonAiOptions(settings, logger);

  const { requestRate, tokenRate } = utils.getRateLimitOptions(
    settings,
    logger,
  );

  const write = settings.ai.write;

  const contextStrategy = workspace.getContextStrategy();

  const exemplars = await workspace.getExemplars();

  const styleGuides = await workspace.getStyleGuides([language]);

  const summaryPath = settings.ai.review.summaryPath;

  const instructions = settings.ai.review.instructions;

  const diffFile = settings.ai.review.diffFile;
  const diffContext = settings.ai.review.diffContext;

  if (diffFile && write) {
    throw new Error(
      "Cannot use --write with --diff-file. Diff-based review is read-only for safety.",
    );
  }

  if (diffFile && summaryPath.length === 0) {
    throw new Error("Must provide --summary-file when using --diff-file.");
  }

  console.log("\n");

  const contentDir = workspace.getContentDirWithTarget(content);

  const includeImages = settings.ai.includeImages;
  const staticPrefix = settings.staticPrefix;
  const staticDir = workspace.getStaticDir();
  const maxImages = settings.ai.maxImages;
  const maxImageSize = settings.ai.maxImageSize;

  const tree = await workspace.buildTree(contentDir);

  let parsedDiff: ParsedDiff | null = null;
  if (diffFile) {
    const diffContent = fs.readFileSync(
      utils.buildPath(diffFile, cwd),
      "utf-8",
    );
    parsedDiff = parseUnifiedDiff(
      diffContent,
      path.relative(workspace.config.getCwd(), contentDir),
    );
  }

  const client = new DefaultBedrockClient(
    model,
    maxTokens,
    requestRate,
    tokenRate,
  );

  const reviewCheck = settings.ai.review.runChecks;
  const checkOptions = reviewCheck
    ? await workspace.getCheckConfig(contentDir, {
        rootContentDir: workspace.getContentDir(),
        locale: language.code,
      })
    : null;

  const result = await reviewContent(
    {
      tree,
      client,
      language,
      contextStrategy,
      styleGuides,
      exemplars,
      instructions,
      parsedDiff,
      diffContext,
      checkOptions,
      write,
      includeImages,
      maxImages,
      maxImageSize,
      staticPrefix,
      staticDir,
      cacheEnabled: shouldEnableCache(contextStrategy),
      editMode: settings.ai.editMode,
      onDebug: utils.getDebugCallback(options),
    },
    (event) => printEvent(event, Boolean(parsedDiff)),
  );

  if (summaryPath.length > 0) {
    await utils.withSpinner(`Writing summary to ${summaryPath}`, async () => {
      const summaryContent = await summarizeReview(
        client,
        result.diffs,
        Boolean(parsedDiff),
      );

      fs.writeFileSync(
        utils.buildPath(summaryPath, cwd),
        summaryContent,
        "utf-8",
      );
    });
  }
}

function printEvent(event: ReviewEvent, diffScoped: boolean): void {
  switch (event.kind) {
    case "reviewing":
      console.log(`⏳ Processing ${event.node.filePath}`);
      break;
    case "reviewed":
      if (event.written) {
        console.log(`📜 Wrote to file ${event.node.filePath}`);
      } else if (!diffScoped) {
        utils.displayDiff(event.original, event.revised);
      }
      console.log(`\n💰 ${utils.printTokenUsage(event.usage)}\n`);
      break;
    case "unchanged":
      console.log(
        `✅ No changes needed for ${event.node.filePath}: ${event.summary}`,
      );
      console.log(`\n💰 ${utils.printTokenUsage(event.usage)}\n`);
      break;
    case "no-suggestions":
      console.log(
        `⏭️  Skipped ${event.node.filePath || event.node.path} (no relevant suggestions)\n`,
      );
      break;
  }
}
