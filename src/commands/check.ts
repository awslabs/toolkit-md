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
 * @fileoverview CLI command for checking markdown content.
 *
 * Provides a thin CLI wrapper around the check module, handling option
 * parsing, content tree construction, output formatting, and exit codes.
 */

import { Command } from "commander";
import { checkAll, formatCheckResults } from "../check/index.js";
import type { LogWriter } from "../core/logger.js";
import { Workspace } from "../core/workspace.js";
import { logo } from "./logo.js";
import {
  checkOptions,
  commonOptions,
  contentDirOption,
  languageOptions,
} from "./options.js";
import * as utils from "./utils.js";

export function createCheckCommand(): Command {
  const command = new Command("check");

  commonOptions(command);
  contentDirOption(command);
  languageOptions(command);
  checkOptions(command);

  command
    .argument("<content>", "file path to content to check")
    .description(
      "Checks content for linting issues, broken links, missing images, and spelling errors",
    )
    .action(utils.withErrorHandling("Check", executeAction));

  return command;
}

async function executeAction(
  content: string,
  options: Record<string, unknown>,
  logger: LogWriter,
): Promise<void> {
  logo();

  console.log("Checking content...\n");

  const cwd = utils.getCwd(options);

  const workspace = await Workspace.create(cwd, {
    cliOptions: options,
    logger,
  });

  const { language } = workspace;
  const contentDir = workspace.getContentDirWithTarget(content);
  const rootContentDir = workspace.getContentDir();

  const tree = await workspace.buildTree(contentDir);

  const nodes = tree.getFlattenedTree();

  const result = await checkAll(nodes, {
    ...(await workspace.getCheckConfig(contentDir, {
      rootContentDir,
      locale: language.code,
    })),
    contentTree: tree,
  });

  console.log(
    formatCheckResults(result, { baseDir: contentDir, colors: true }),
  );

  if (result.totalErrors > 0) {
    process.exit(1);
  }
}
