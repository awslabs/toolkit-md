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
import { DefaultBedrockClient } from "../ai/index.js";
import { askContent } from "../core/ask.js";
import type { LogWriter } from "../core/logger.js";
import { Workspace } from "../core/workspace.js";
import { logo } from "./logo.js";
import {
  commonAiOptions,
  exemplarOption,
  languageOptions,
  rateLimitOptions,
  styleGuideOption,
} from "./options.js";
import * as utils from "./utils.js";

export function createAskCommand(): Command {
  const command = new Command("ask");

  commonAiOptions(command);
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

async function executeAction(
  content: string,
  // biome-ignore lint/suspicious/noExplicitAny: Need a better way to handle CLI options
  options: any,
  logger: LogWriter,
): Promise<void> {
  logo();

  const cwd = utils.getCwd(options);

  console.log("Checking content...");

  if (!options.question) {
    console.error("You must provide a question with --question/-q");
    process.exit(1);
  }

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

  const exemplars = await workspace.getExemplars();

  const styleGuides = await workspace.getStyleGuides([language]);

  console.log("\n");

  const contentDir = workspace.getContentDir();

  const tree = await workspace.buildTree(contentDir || content);

  const client = new DefaultBedrockClient(
    model,
    maxTokens,
    requestRate,
    tokenRate,
  );

  const { answer, usage } = await utils.withSpinner(
    `Processing question`,
    async () => {
      return await askContent({
        tree,
        client,
        question: options.question,
        language,
        styleGuides,
        exemplars,
      });
    },
  );

  console.log(answer);

  console.log(`\n💰 ${utils.printTokenUsage(usage)}\n`);
}
