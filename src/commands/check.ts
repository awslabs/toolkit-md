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

import chalk from "chalk";
import { Command } from "commander";
import { type CheckResult, checkAll } from "../check/index.js";
import { ConfigManager } from "../config/index.js";
import type { LogWriter } from "./logger.js";
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
      "Checks content for linting issues, broken links, and missing images",
    )
    .action(utils.withErrorHandling("Check", executeAction));

  return command;
}

async function executeAction(
  content: string,
  options: Record<string, unknown>,
  _logger: LogWriter,
): Promise<void> {
  logo();

  console.log("Checking content...\n");

  const cwd = utils.getCwd(options);
  const config = new ConfigManager(cwd);
  await config.initialize(options);

  const { language, defaultLanguage } = utils.getLanguages(config);
  const contentDir = utils.getContentDirWithTarget(config, content);
  const rootContentDir = utils.getContentDir(config);

  const tree = await utils.buildContentTree(
    contentDir,
    defaultLanguage,
    language,
  );

  const nodes = tree.getFlattenedTree();

  const result = await checkAll(nodes, {
    ...utils.getCheckConfig(config, contentDir, rootContentDir),
    contentTree: tree,
  });

  printResults(result, contentDir);

  if (result.totalErrors > 0) {
    process.exit(1);
  }
}

function printResults(result: CheckResult, baseDir: string): void {
  for (const file of result.files) {
    const relativePath = file.filePath.startsWith(baseDir)
      ? file.filePath.substring(baseDir.length + 1)
      : file.filePath;

    if (file.issues.length === 0) {
      continue;
    } else {
      console.log(chalk.underline(relativePath));
      for (const issue of file.issues) {
        const location = chalk.gray(`  ${issue.line}:${issue.column}`);
        const severity =
          issue.severity === "error"
            ? chalk.red(issue.severity)
            : chalk.yellow(issue.severity);
        const rule = chalk.gray(issue.rule);
        const category = chalk.gray(`(${issue.category})`);
        console.log(
          `${location}  ${severity}  ${rule}  ${issue.message}  ${category}`,
        );
      }
    }

    console.log();
  }

  const summary = [];
  if (result.totalErrors > 0) {
    summary.push(
      chalk.red(
        `${result.totalErrors} error${result.totalErrors !== 1 ? "s" : ""}`,
      ),
    );
  }
  if (result.totalWarnings > 0) {
    summary.push(
      chalk.yellow(
        `${result.totalWarnings} warning${result.totalWarnings !== 1 ? "s" : ""}`,
      ),
    );
  }

  const fileCount = result.files.length;
  if (summary.length > 0) {
    console.log(
      `\nResults: ${summary.join(", ")} in ${fileCount} file${fileCount !== 1 ? "s" : ""}`,
    );
  } else {
    console.log(
      chalk.green(
        `\nAll ${fileCount} file${fileCount !== 1 ? "s" : ""} passed`,
      ),
    );
  }
}
