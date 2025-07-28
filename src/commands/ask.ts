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

import { Command } from "commander";
import { buildAskPrompt, DefaultBedrockClient } from "../ai/index.js";
import { ConfigManager } from "../config/index.js";
import { MarkdownTree } from "../content/index.js";
import {
  commonOptions,
  exemplarOption,
  languageOptions,
  rateLimitOptions,
  styleGuideOption,
} from "./options.js";
import * as utils from "./utils.js";

export function createAskCommand(): Command {
  const command = new Command("ask");

  commonOptions(command);
  languageOptions(command);
  exemplarOption(command);
  styleGuideOption(command);
  rateLimitOptions(command);

  command
    .argument("<content>", "file path to content to query")
    .description("Ask a question about the content")
    .option("-q, --question <value>", "Question to ask about the content")
    .action(utils.withErrorHandling("Ask", executeAction));

  return command;
}

// biome-ignore lint/suspicious/noExplicitAny: Need a better way to handle CLI options
async function executeAction(content: string, options: any): Promise<void> {
  console.log("Checking content...");

  if (!options.question) {
    console.error("You must provide a question with --question/-q");
    process.exit(1);
  }

  const config = new ConfigManager();
  config.initialize(options);

  const baseDir = utils.getBaseDir(config);

  const { language, defaultLanguage } = utils.getLanguages(config);

  const { model, maxTokens } = utils.getCommonAiOptions(config);

  const { requestRate, tokenRate } = utils.getRateLimitOptions(config);

  const exemplars = utils.getExemplars(baseDir, defaultLanguage, config);

  const styleGuides = utils.getStyleGuides(baseDir, config, defaultLanguage, [
    language,
  ]);

  console.log("\n");

  const tree = new MarkdownTree(
    utils.buildPath(content, baseDir),
    defaultLanguage.code,
  );

  const client = new DefaultBedrockClient(
    model,
    maxTokens,
    requestRate,
    tokenRate,
    5,
  );

  const prompt = buildAskPrompt(
    options.question,
    tree,
    language,
    styleGuides,
    exemplars,
  );

  const { response } = await utils.withSpinner(
    `Processing question`,
    async () => {
      return { response: await client.generate(prompt) };
    },
  );

  console.log(response.output);

  console.log(`\n💰 ${utils.printTokenUsage(response.usage)}\n`);
}
