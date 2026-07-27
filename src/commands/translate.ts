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

import chalk from "chalk";
import { Command } from "commander";
import { DefaultBedrockClient } from "../ai/index.js";
import {
  CONFIG_CHECK_TRANSLATION,
  CONFIG_EDIT_MODE,
  CONFIG_FORCE_TRANSLATION,
  CONFIG_TRANSLATION_DIR,
  CONFIG_TRANSLATION_SKIP_SUFFIX,
} from "../config/index.js";
import type { LogWriter } from "../core/logger.js";
import { type TranslateEvent, translateContent } from "../core/translate.js";
import { shouldEnableCache, Workspace } from "../core/workspace.js";
import { Language } from "../languages/index.js";
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

export function createTranslateCommand(): Command {
  const command = new Command("translate");

  commonAiOptions(command);
  fileWriteOptions(command);
  languageOptions(command);
  exemplarOption(command);
  styleGuideOption(command);
  contextOptions(command);

  command
    .argument("<content>", "file path to content to translate")
    .description("Translates the given content")
    .option(
      "--to <value>",
      `Target language (${Language.getLanguages().map((l) => l.code)})`,
    )
    .action(utils.withErrorHandling("Translate", executeAction));

  utils.optionForConfigSchema(command, CONFIG_CHECK_TRANSLATION);
  utils.optionForConfigSchema(command, CONFIG_FORCE_TRANSLATION);
  utils.optionForConfigSchema(command, CONFIG_TRANSLATION_DIR);
  utils.optionForConfigSchema(command, CONFIG_TRANSLATION_SKIP_SUFFIX);
  utils.optionForConfigSchema(command, CONFIG_EDIT_MODE);

  return command;
}

async function executeAction(
  content: string,
  // biome-ignore lint/suspicious/noExplicitAny: Need a better way to handle CLI options
  options: any,
  logger: LogWriter,
): Promise<void> {
  logo();

  const cwd = utils.getCwd(options);

  const workspace = await Workspace.create(cwd, {
    cliOptions: options,
    logger,
  });

  const { language, defaultLanguage, settings } = workspace;
  const targetLanguage = Language.getLanguage(options.to);

  if (!targetLanguage) {
    throw new Error(`Unsupported target language ${options.to}`);
  }

  console.log(
    `Translating content from ${language.name} to ${targetLanguage.name}...`,
  );

  const { model, maxTokens } = utils.getCommonAiOptions(settings, logger);

  const { requestRate, tokenRate } = utils.getRateLimitOptions(
    settings,
    logger,
  );

  const write = settings.ai.write;

  const contextStrategy = workspace.getContextStrategy();

  const exemplars = await workspace.getExemplars();

  const styleGuides = await workspace.getStyleGuides([
    language,
    targetLanguage,
  ]);

  const contentDir = workspace.getContentDirWithTarget(content);
  const { translationDir, overridden: translationDirOverridden } =
    workspace.getTranslationDir(contentDir);
  const forceTranslation = settings.ai.translation.force;
  const checkTranslation = settings.ai.translation.check;
  const skipFileSuffix = settings.ai.translation.skipFileSuffix;

  if (skipFileSuffix && !translationDirOverridden) {
    throw new Error(
      `Translation directory must be overridden with --translation-dir when skip file suffix is enabled.`,
    );
  }

  console.log("\n");

  const sourceTree = await workspace.buildTree(contentDir);

  const targetTree = await workspace.buildTree(translationDir, {
    defaultLanguage: skipFileSuffix ? targetLanguage : defaultLanguage,
    language: targetLanguage,
    includeLanguageSuffix: !skipFileSuffix,
  });

  const client = new DefaultBedrockClient(
    model,
    maxTokens,
    requestRate,
    tokenRate,
  );

  const result = await translateContent(
    {
      sourceTree,
      targetTree,
      client,
      sourceLanguage: language,
      targetLanguage,
      contextStrategy,
      styleGuides,
      exemplars,
      force: forceTranslation,
      checkOnly: checkTranslation,
      write,
      cacheEnabled: shouldEnableCache(contextStrategy),
      editMode: settings.ai.editMode,
      onDebug: utils.getDebugCallback(options),
    },
    printEvent,
  );

  if (checkTranslation && result.changeDetected) {
    console.log(
      chalk.yellow(
        "\nSome files require translation, run the command again without --check to translate",
      ),
    );
    process.exit(1);
  }
}

function printEvent(event: TranslateEvent): void {
  switch (event.kind) {
    case "skipped":
      console.log(
        `ℹ️  ${chalk.yellow("Skipping")} ${event.node.filePath} - no changes detected`,
      );
      break;
    case "translating":
      console.log(`⏳ Processing ${event.node.filePath}`);
      break;
    case "translation-required":
      console.log(`⚠️  Translation required for ${event.node.filePath}`);
      break;
    case "translated":
      if (event.written) {
        console.log(`📜 Wrote to file ${event.targetNode?.filePath}`);
      } else {
        console.log(event.output);
      }
      console.log(`\n💰 ${utils.printTokenUsage(event.usage)}\n`);
      break;
    case "no-content":
      console.log(
        `⚠️  No content found for language ${event.node.language} in ${event.node.filePath}`,
      );
      break;
    case "orphan":
      if (event.removed) {
        console.log(`🔃 Cleaning up orphaned translation for ${event.path}`);
      } else {
        console.log(
          `⚠️  Orphaned translation file ${event.path} should be cleaned up`,
        );
      }
      break;
  }
}
