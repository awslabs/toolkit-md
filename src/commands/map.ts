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

/**
 * @fileoverview CLI command for printing the content tree map.
 */

import { Command } from "commander";
import { CONFIG_CONTENT_DIR, ConfigManager } from "../config/index.js";
import type { LogWriter } from "./logger.js";
import { logo } from "./logo.js";
import { commonOptions, languageOptions } from "./options.js";
import * as utils from "./utils.js";

export function createMapCommand(): Command {
  const command = new Command("map");

  commonOptions(command);
  languageOptions(command);

  utils.optionForConfigSchema(command, CONFIG_CONTENT_DIR);

  command
    .argument("<content>", "file path to content directory")
    .option("--images", "Include image paths in the tree output")
    .description("Prints the content tree map")
    .action(utils.withErrorHandling("Map", executeAction));

  return command;
}

async function executeAction(
  content: string,
  // biome-ignore lint/suspicious/noExplicitAny: Need a better way to handle CLI options
  options: any,
  _logger: LogWriter,
): Promise<void> {
  logo();

  const cwd = utils.getCwd(options);
  const config = new ConfigManager(cwd);
  await config.initialize(options);

  const { language, defaultLanguage } = utils.getLanguages(config);
  const contentDir = utils.getContentDirWithTarget(config, content);
  const includeImages = options.images ?? false;

  const tree = await utils.buildContentTree(contentDir, defaultLanguage, language);

  console.log(tree.getTreeMap(includeImages));
}
