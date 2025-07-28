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

import * as fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { type Command, Option } from "commander";
import { diffWordsWithSpace } from "diff";
import ora from "ora";
import type z from "zod";
import { ZodArray, ZodBoolean } from "zod";
import type { ContextStrategy, TokenUsage } from "../ai/index.js";
import type { ConfigManager } from "../config/index.js";
import {
  getFlattenedTree,
  MarkdownTree,
  type TreeNode,
} from "../content/index.js";
import { Language } from "../languages/index.js";

export function collect(value: unknown, previous: unknown[]) {
  return (previous ?? []).concat([value]);
}

export async function loadOptionalPath(
  path: string | undefined,
  baseDir: string | undefined,
) {
  if (!path) {
    return "";
  }

  const resolvedPath = buildPath(path, baseDir);

  return await fs.promises.readFile(resolvedPath, "utf8");
}

export function buildPath<T extends string | undefined>(
  filepath: T,
  contextPath?: string,
): T {
  if (!filepath) {
    return undefined as T;
  }

  if (!path.isAbsolute(filepath) && contextPath) {
    return path.join(contextPath, filepath) as T;
  }

  return filepath;
}

export function getBaseDir(config: ConfigManager) {
  return path.resolve(config.get<string>("baseDir"));
}

export function printRelativePath(filepath: string, baseDir: string) {
  return path.relative(baseDir, filepath);
}

export function displayDiff(originalContent: string, updatedContent: string) {
  const diff = diffWordsWithSpace(originalContent, updatedContent);

  diff.forEach((part) => {
    let text = part.value;
    const whitespace = text.trim().length === 0;

    if (part.added) {
      text = whitespace ? chalk.green.bgGreen(text) : chalk.green(text);
    } else if (part.removed) {
      text = whitespace
        ? chalk.red.bgRed(text)
        : chalk.red(chalk.strikethrough(text));
    }
    process.stderr.write(text);
  });
}

export function getLanguages(config: ConfigManager): {
  language: Language;
  defaultLanguage: Language;
} {
  const language = Language.getLanguage(config.get<string>("language"));

  if (!language) {
    throw new Error("Language not set");
  }

  const defaultLanguage = Language.getLanguage(
    config.get<string>("defaultLanguage"),
  );

  if (!defaultLanguage) {
    throw new Error("Default language not set");
  }

  return { language, defaultLanguage };
}

export function getCommonAiOptions(config: ConfigManager) {
  const model = config.get<string>("ai.model");

  console.log(`⭐ Using model ${model}`);

  const maxTokens = config.get<number>("ai.maxTokens");

  return {
    model,
    maxTokens,
  };
}

export function getWriteOption(config: ConfigManager) {
  return config.get<boolean>("ai.write");
}

export function getRateLimitOptions(config: ConfigManager) {
  const requestRate = config.get<number>("ai.rate.requests");

  if (requestRate > 0) {
    console.log(`⏳ Rate limiting to ${requestRate} requests per minute`);
  }

  const tokenRate = config.get<number>("ai.rate.tokens");

  if (tokenRate > 0) {
    console.log(`⏳ Rate limiting to ${tokenRate} tokens per minute`);
  }

  return {
    requestRate,
    tokenRate,
  };
}

export function getExemplars(
  baseDir: string,
  defaultLanguage: Language,
  config: ConfigManager,
) {
  const exemplars = config.get<string[]>("ai.exemplars");

  const exemplarFiles: TreeNode[] = [];

  for (const exemplar of exemplars) {
    const moreFiles = getFlattenedTree(
      buildPath(exemplar as string, baseDir),
      defaultLanguage.code,
    );
    exemplarFiles.push(...moreFiles);
  }

  return exemplarFiles;
}

export function getContextStrategy(config: ConfigManager) {
  const strategy = config.get<string>("ai.contextStrategy");
  if (!["everything", "nothing", "siblings"].includes(strategy)) {
    throw new Error(`Unsupported context strategy ${strategy}`);
  }
  return strategy as ContextStrategy;
}

export function getStyleGuides(
  baseDir: string,
  config: ConfigManager,
  defaultLanguage: Language,
  languages?: Language[],
): string[] {
  const styleGuides = config.get<string[]>("ai.styleGuides");
  const styleGuideFiles: string[] = [];

  if (styleGuides.length > 0) {
    console.log(`📚 Using style guides:`);

    for (const styleGuidePath of styleGuides) {
      const resolvedPath = buildPath(styleGuidePath, baseDir);

      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Failed to load style guide ${resolvedPath}`);
      }

      const stats = fs.statSync(resolvedPath);

      if (!languages) {
        languages = [defaultLanguage];
      }

      if (stats.isDirectory()) {
        console.log(`  - ${styleGuidePath}/`);

        const tree = new MarkdownTree(resolvedPath, defaultLanguage.code);

        for (const language of languages) {
          const contentFiles = tree.getContent(language.code);

          for (const contentFile of contentFiles) {
            console.log(
              `  -> ${printRelativePath(contentFile.path, resolvedPath)}`,
            );

            styleGuideFiles.push(contentFile.content);
          }
        }
      } else {
        console.log(`  - ${styleGuidePath}`);

        const content = fs.readFileSync(resolvedPath, "utf8");

        styleGuideFiles.push(content);
      }
    }
  }

  return styleGuideFiles;
}

export function shouldEnableCache(contextStrategy: ContextStrategy) {
  if (contextStrategy === "nothing") {
    return false;
  }

  return true;
}

type CommandAction<T> = (content: string, options: T) => Promise<void>;

export function withErrorHandling<T>(
  actionName: string,
  action: CommandAction<T>,
): CommandAction<T> {
  return async (content: string, options: T) => {
    try {
      await action(content, options);
    } catch (error) {
      console.error(`\n\n❌ ${actionName} failed:`);
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
        if (process.env.NODE_ENV === "development") {
          console.error(chalk.gray(error.stack));
        }
      } else {
        console.error(chalk.red("An unexpected error occurred"));
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

export function printTokenUsage(usage: TokenUsage) {
  let cacheUsage = "";

  if (usage.cacheReadInputTokens) {
    cacheUsage += ` Cache Read ${usage.cacheReadInputTokens}`;
  }

  if (usage.cacheWriteInputTokens) {
    cacheUsage += ` Cache Write ${usage.cacheWriteInputTokens}`;
  }

  if (cacheUsage) {
    cacheUsage = ` (${cacheUsage.trim()})`;
  }

  return `Usage: Input ${usage.inputTokens}${cacheUsage} | Output ${usage.outputTokens} | Total ${usage.totalTokens} | Estimated ${usage.estimatedTokens}`;
}

export function optionForConfigSchema(
  command: Command,
  // biome-ignore lint/suspicious/noExplicitAny: Better handling of zod?
  schema: z.ZodDefault<any>,
) {
  const flags = camelToOptionFlag(schema.cli);

  let flagString = `${flags} <value>`;

  if (schema._def.innerType instanceof ZodBoolean) {
    flagString = flags;
  }

  const option = new Option(flagString, optionDescriptionFromSchema(schema));

  if (schema._def.innerType instanceof ZodArray) {
    option.argParser(collect);
  }

  return command.addOption(option);
}

// biome-ignore lint/suspicious/noExplicitAny: Better handling of zod?
export function optionDescriptionFromSchema(schema: z.ZodDefault<any>) {
  const env = schema.envPrefix ? `${schema.envPrefix}_*` : schema.env;
  return `${schema.description} (${env}) (default: ${JSON.stringify(
    schema._def.defaultValue(),
  )})`;
}

/**
 * Converts a camel case string to a kebab case string with a "--" prefix
 *
 * @param camelCase - The camel case string to convert
 * @returns The kebab case string with "--" prefix
 *
 * @example
 * ```ts
 * camelToOptionFlag("check") // returns "--check"
 * camelToOptionFlag("baseDir") // returns "--base-dir"
 * ```
 */
export function camelToOptionFlag(camelCase: string): string {
  // Convert camel case to kebab case by finding capital letters and replacing with "-lowercase"
  const kebabCase = camelCase.replace(/([A-Z])/g, "-$1").toLowerCase();

  // Add the "--" prefix and ensure no double hyphens
  return `--${kebabCase}`;
}
