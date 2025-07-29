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
  ConfigManager,
} from "../config/index.js";
import { MarkdownTree, TRANSLATION_SRC_HASH_KEY } from "../content/index.js";
import { Language } from "../languages/index.js";
import {
  commonOptions,
  contextOptions,
  exemplarOption,
  fileWriteOptions,
  languageOptions,
  styleGuideOption,
} from "./options.js";
import * as utils from "./utils.js";

export function createTranslateCommand(): Command {
  const command = new Command("translate");

  commonOptions(command);
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

  return command;
}

// biome-ignore lint/suspicious/noExplicitAny: Need a better way to handle CLI options
async function executeAction(content: string, options: any): Promise<void> {
  const config = new ConfigManager();
  await config.initialize(options);

  const baseDir = utils.getBaseDir(config);

  const { language, defaultLanguage } = utils.getLanguages(config);
  const targetLanguage = Language.getLanguage(options.to);

  if (!targetLanguage) {
    throw new Error(`Unsupported target language ${options.to}`);
  }

  console.log(
    `Translating content from ${language.name} to ${targetLanguage.name}...`,
  );

  const { model, maxTokens } = utils.getCommonAiOptions(config);

  const { requestRate, tokenRate } = utils.getRateLimitOptions(config);

  const write = utils.getWriteOption(config);

  const contextStrategy = utils.getContextStrategy(config);

  const exemplars = utils.getExemplars(baseDir, defaultLanguage, config);

  const styleGuides = utils.getStyleGuides(baseDir, config, defaultLanguage, [
    language,
    targetLanguage,
  ]);

  const enableCache = utils.shouldEnableCache(contextStrategy);

  const forceTranslation = config.get<boolean>("ai.translation.force");
  const checkTranslation = config.get<boolean>("ai.translation.check");

  let changeDetected = false;

  console.log("\n");

  const tree = new MarkdownTree(
    utils.buildPath(content, baseDir),
    defaultLanguage.code,
  );

  const nodes = tree.getFlattenedTree();

  const client = new DefaultBedrockClient(
    model,
    maxTokens,
    requestRate,
    tokenRate,
    5,
  );

  for (const node of nodes) {
    const languageContent = node.languages.get(language.code);

    if (languageContent) {
      const existingTranslation = node.languages.get(targetLanguage.code);

      if (!forceTranslation && existingTranslation) {
        const existingTranslationHash = existingTranslation.frontmatter[
          TRANSLATION_SRC_HASH_KEY
        ] as string | undefined;

        if (existingTranslationHash) {
          if (existingTranslationHash === languageContent.hash) {
            console.log(
              `ℹ️  ${chalk.yellow("Skipping")} ${utils.printRelativePath(
                node.path,
                baseDir,
              )} - no changes detected`,
            );
            continue;
          }
        }
      }

      changeDetected = true;

      if (checkTranslation) {
        console.log(
          `⚠️  Translation required for ${utils.printRelativePath(
            node.path,
            baseDir,
          )}`,
        );
        continue;
      }

      const prompt = buildTranslatePrompt(
        tree,
        node,
        languageContent,
        existingTranslation,
        language,
        targetLanguage,
        contextStrategy,
        styleGuides,
        exemplars,
      );

      const { response } = await utils.withSpinner(
        `Processing ${utils.printRelativePath(languageContent.path, baseDir)}`,
        async () => {
          return { response: await client.generate(prompt, enableCache) };
        },
      );

      if (write) {
        const { languageContent: writtenContent } = tree.addOrUpdateContent(
          node.path,
          response.output,
          targetLanguage.code,
        );

        console.log(
          `📜 Wrote to file ${utils.printRelativePath(writtenContent.path, baseDir)}`,
        );
      } else {
        console.log(response.output);
      }

      console.log(`\n💰 ${utils.printTokenUsage(response.usage)}\n`);
    } else {
      console.log(
        `⚠️  No content found for language ${language.code} in ${utils.printRelativePath(
          node.path,
          baseDir,
        )}`,
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
