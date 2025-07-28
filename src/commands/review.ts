/**
 * Copyright 2025 bleh
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

import { Command } from "commander";
import { buildReviewPrompt, DefaultBedrockClient } from "../ai/index.js";
import { ConfigManager } from "../config/index.js";
import { MarkdownTree } from "../content/index.js";
import {
  commonOptions,
  contextOptions,
  exemplarOption,
  fileWriteOptions,
  languageOptions,
  styleGuideOption,
} from "./options.js";
import * as utils from "./utils.js";

export function createReviewCommand(): Command {
  const command = new Command("review");

  commonOptions(command);
  fileWriteOptions(command);
  languageOptions(command);
  exemplarOption(command);
  styleGuideOption(command);
  contextOptions(command);

  command
    .argument("<content>", "file path to content to review")
    .description("Reviews the given content")
    .action(utils.withErrorHandling("Review", executeAction));

  return command;
}

// biome-ignore lint/suspicious/noExplicitAny: Need a better way to handle CLI options
async function executeAction(content: string, options: any): Promise<void> {
  console.log("Reviewing content...");

  const config = new ConfigManager();
  config.initialize(options);

  const baseDir = utils.getBaseDir(config);

  const { language, defaultLanguage } = utils.getLanguages(config);

  const { model, maxTokens } = utils.getCommonAiOptions(config);

  const { requestRate, tokenRate } = utils.getRateLimitOptions(config);

  const write = utils.getWriteOption(config);

  const contextStrategy = utils.getContextStrategy(config);

  const exemplars = utils.getExemplars(baseDir, defaultLanguage, config);

  const styleGuides = utils.getStyleGuides(baseDir, config, defaultLanguage, [
    language,
  ]);

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
      const prompt = buildReviewPrompt(
        tree,
        node,
        language,
        contextStrategy,
        styleGuides,
        exemplars,
      );

      const { response } = await utils.withSpinner(
        `Processing ${utils.printRelativePath(languageContent.path, baseDir)}`,
        async () => {
          return { response: await client.generate(prompt) };
        },
      );

      if (write) {
        const { languageContent } = tree.addOrUpdateContent(
          node.path,
          response.output,
          language.code,
        );

        console.log(
          `📜 Wrote to file ${utils.printRelativePath(languageContent.path, baseDir)}`,
        );
      } else {
        utils.displayDiff(languageContent.content, response.output);
      }

      console.log(`\n💰 ${utils.printTokenUsage(response.usage)}\n`);
    }
  }
}
