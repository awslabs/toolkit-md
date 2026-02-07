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
import { buildTranslatePrompt, DefaultBedrockClient } from "../ai/index.js";
import {
  CONFIG_CHECK_TRANSLATION,
  CONFIG_FORCE_TRANSLATION,
  CONFIG_TRANSLATION_DIR,
  CONFIG_TRANSLATION_SKIP_SUFFIX,
  ConfigManager,
} from "../config/index.js";
import {
  type ContentNode,
  LEGACY_TRANSLATION_SRC_HASH_KEY,
  TRANSLATION_SRC_HASH_KEY,
} from "../content/index.js";
import { Language } from "../languages/index.js";
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
    .option("--to <value>", `Target language (${Language.getLanguages()})`)
    .action(utils.withErrorHandling("Translate", executeAction));

  utils.optionForConfigSchema(command, CONFIG_CHECK_TRANSLATION);
  utils.optionForConfigSchema(command, CONFIG_FORCE_TRANSLATION);
  utils.optionForConfigSchema(command, CONFIG_TRANSLATION_DIR);
  utils.optionForConfigSchema(command, CONFIG_TRANSLATION_SKIP_SUFFIX);

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

  const config = new ConfigManager(cwd);
  await config.initialize(options);

  const { language, defaultLanguage } = utils.getLanguages(config);
  const targetLanguage = Language.getLanguage(options.to);

  if (!targetLanguage) {
    throw new Error(`Unsupported target language ${options.to}`);
  }

  console.log(
    `Translating content from ${language.name} to ${targetLanguage.name}...`,
  );

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
    [language, targetLanguage],
  );

  const enableCache = utils.shouldEnableCache(contextStrategy);

  const contentDir = utils.getContentDirWithTarget(config, content);
  const { translationDir, overridden: translationDirOverridden } =
    utils.getTranslationDir(config, contentDir);
  const forceTranslation = config.get<boolean>("ai.translation.force");
  const checkTranslation = config.get<boolean>("ai.translation.check");
  const skipFileSuffix = config.get<boolean>("ai.translation.skipFileSuffix");

  if (skipFileSuffix && !translationDirOverridden) {
    throw new Error(
      `Translation directory must be overridden with --translation-dir when skip file suffix is enabled.`,
    );
  }

  let changeDetected = false;

  console.log("\n");

  const sourceTree = await utils.buildContentTree(
    contentDir,
    defaultLanguage,
    language,
  );

  const nodes = sourceTree.getFlattenedTree();

  const client = new DefaultBedrockClient(
    model,
    maxTokens,
    requestRate,
    tokenRate,
    5,
  );

  // Create target tree to check for existing translations
  const targetTree = await utils.buildContentTree(
    translationDir,
    skipFileSuffix ? targetLanguage : defaultLanguage,
    targetLanguage,
    !skipFileSuffix,
  );

  const initialTargetNodes = targetTree
    .getNodes()
    .filter((e) => !e.isDirectory)
    .map((e) => e.path);

  for (const node of nodes) {
    removeTargetNode(node, initialTargetNodes);

    if (node.content) {
      // Find corresponding node inß target tree
      const targetNode = targetTree.getNode(node.path);
      const existingTranslation = targetNode?.content;

      if (!forceTranslation && existingTranslation && targetNode?.frontmatter) {
        let existingTranslationHash: string | undefined;

        if (TRANSLATION_SRC_HASH_KEY in targetNode.frontmatter) {
          existingTranslationHash = targetNode.frontmatter[
            TRANSLATION_SRC_HASH_KEY
          ] as string;
        } else if (LEGACY_TRANSLATION_SRC_HASH_KEY in targetNode.frontmatter) {
          existingTranslationHash = targetNode.frontmatter[
            LEGACY_TRANSLATION_SRC_HASH_KEY
          ] as string;
        }

        if (existingTranslationHash) {
          if (existingTranslationHash === node.hash) {
            console.log(
              `ℹ️  ${chalk.yellow("Skipping")} ${node.filePath} - no changes detected`,
            );
            continue;
          }
        }
      }

      changeDetected = true;

      if (checkTranslation) {
        console.log(`⚠️  Translation required for ${node.filePath}`);
        continue;
      }

      const prompt = buildTranslatePrompt(
        sourceTree,
        node,
        targetNode || undefined,
        language,
        targetLanguage,
        contextStrategy,
        styleGuides,
        exemplars,
      );

      const { response } = await utils.withSpinner(
        `Processing ${node.filePath}`,
        async () => {
          return { response: await client.generate(prompt, enableCache) };
        },
      );

      if (write) {
        let writtenNode = targetNode;

        if (!writtenNode) {
          writtenNode = await targetTree.create(node.path, response.output);
        } else {
          await targetTree.updateContent(writtenNode, response.output);
        }

        console.log(`📜 Wrote to file ${writtenNode.filePath}`);
      } else {
        console.log(response.output);
      }

      console.log(`\n💰 ${utils.printTokenUsage(response.usage)}\n`);
    } else {
      console.log(
        `⚠️  No content found for language ${language.code} in ${node.filePath}`,
      );
    }
  }

  for (const leftoverNodePath of initialTargetNodes) {
    changeDetected = true;

    if (write) {
      console.log(
        `🔃 Cleaning up orphaned translation for ${leftoverNodePath}`,
      );

      targetTree.delete(leftoverNodePath);
    } else {
      console.log(
        `⚠️  Orphaned translation file ${leftoverNodePath} should be cleaned up`,
      );
    }
  }

  if (checkTranslation && changeDetected) {
    console.log(
      chalk.yellow(
        "\nSome files require translation, run the command again without --check to translate",
      ),
    );
    process.exit(1);
  }
}

function removeTargetNode(node: ContentNode, targetNodes: string[]) {
  const index = targetNodes.indexOf(node.path);
  if (index !== -1) {
    targetNodes.splice(index, 1);
  }
}
