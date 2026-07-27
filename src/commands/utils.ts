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
 * @fileoverview CLI command plumbing shared across commands.
 *
 * Holds config-derived option accessors that log as they resolve, error
 * handling and spinner wrappers, and re-exports of the option bridge and
 * formatting helpers.
 */

import path from "node:path";
import chalk from "chalk";
import ora from "ora";
import type { Config } from "../config/index.js";
import { ConsoleLogger, type LogWriter } from "../core/logger.js";
import { buildPath } from "../core/workspace.js";

export { buildPath };
export * from "./format.js";
export * from "./optionBridge.js";

// biome-ignore lint/suspicious/noExplicitAny: Options not typed
export function getCwd(options: any) {
  return options.cwd ? path.resolve(options.cwd) : process.cwd();
}

/**
 * Builds a debug message callback from CLI options.
 *
 * @param options - Parsed CLI options
 * @returns A stderr-writing callback when --debug is set, otherwise undefined
 */
export function getDebugCallback(
  // biome-ignore lint/suspicious/noExplicitAny: Options not typed
  options: any,
): ((message: string) => void) | undefined {
  if (!options.debug) {
    return undefined;
  }

  return (message: string) => {
    console.error(chalk.gray(`[debug] ${message}`));
  };
}

export function getCommonAiOptions(settings: Config, logger: LogWriter) {
  const model = settings.ai.model;

  logger.message(`⭐ Using model ${model}`);

  return {
    model,
    maxTokens: settings.ai.maxTokens,
  };
}

export function getRateLimitOptions(settings: Config, logger: LogWriter) {
  const requestRate = settings.ai.rate.requests;

  if (requestRate > 0) {
    logger.message(`⏳ Rate limiting to ${requestRate} requests per minute`);
  }

  const tokenRate = settings.ai.rate.tokens;

  if (tokenRate > 0) {
    logger.message(`⏳ Rate limiting to ${tokenRate} tokens per minute`);
  }

  return {
    requestRate,
    tokenRate,
  };
}

type CommandAction<T> = (
  content: string,
  options: T,
  logger: LogWriter,
) => Promise<void>;

export function withErrorHandling<T>(
  actionName: string,
  action: CommandAction<T>,
  logger: LogWriter = new ConsoleLogger(),
): CommandAction<T> {
  return async (content: string, options: T) => {
    try {
      await action(content, options, logger);
    } catch (error) {
      logger.error(`\n\n❌ ${actionName} failed:`);
      if (error instanceof Error) {
        logger.error(chalk.red(`Error: ${error.message}`));
        if (process.env.NODE_ENV === "development") {
          logger.error(chalk.gray(error.stack));
        }
      } else {
        logger.error(chalk.red("An unexpected error occurred"));
      }
      process.exit(1);
    }
  };
}

export async function withSpinner<T>(
  message: string,
  operation: () => Promise<T>,
): Promise<T> {
  const spinner = ora(message).start();

  try {
    const result = await operation();
    spinner.succeed();
    return result;
  } catch (error) {
    spinner.fail();

    throw error;
  }
}
