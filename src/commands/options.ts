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

import type { Command } from "commander";
import {
  CONFIG_CHECK_CATEGORIES,
  CONFIG_CHECK_LINK_IGNORE_PATTERNS,
  CONFIG_CHECK_LINK_TIMEOUT,
  CONFIG_CHECK_LINT_IGNORE_RULES,
  CONFIG_CHECK_MIN_SEVERITY,
  CONFIG_CHECK_SKIP_EXTERNAL_LINKS,
  CONFIG_CONTENT_DIR,
  CONFIG_CONTEXT_STRATEGY,
  CONFIG_DEFAULT_LANGUAGE,
  CONFIG_EXEMPLARS,
  CONFIG_LANGUAGE,
  CONFIG_MAX_TOKENS,
  CONFIG_MODEL,
  CONFIG_RATE_LIMIT_REQUESTS,
  CONFIG_RATE_LIMIT_TOKENS,
  CONFIG_STATIC_DIR,
  CONFIG_STATIC_PREFIX,
  CONFIG_STYLE_GUIDES,
  CONFIG_WRITE,
} from "../config/index.js";
import * as utils from "./utils.js";

export const DEFAULT_MODEL = "global.anthropic.claude-sonnet-4-5-20250929-v1:0";
export const DEFAULT_MAX_TOKENS = "4096";

export function commonOptions(command: Command) {
  command.option(
    "--cwd <value>",
    "Specify the current working directory for all commands",
  );
}

export function commonAiOptions(command: Command) {
  utils.optionForConfigSchema(command, CONFIG_CONTENT_DIR);
  utils.optionForConfigSchema(command, CONFIG_MODEL);
  utils.optionForConfigSchema(command, CONFIG_MAX_TOKENS);

  commonOptions(command);
}

export function fileWriteOptions(command: Command) {
  rateLimitOptions(command);

  utils.optionForConfigSchema(command, CONFIG_WRITE);
}

export function rateLimitOptions(command: Command) {
  utils.optionForConfigSchema(command, CONFIG_RATE_LIMIT_REQUESTS);
  utils.optionForConfigSchema(command, CONFIG_RATE_LIMIT_TOKENS);
}

export function languageOptions(command: Command) {
  defaultLanguageOption(command);

  utils.optionForConfigSchema(command, CONFIG_LANGUAGE);
}

export function defaultLanguageOption(command: Command) {
  utils.optionForConfigSchema(command, CONFIG_DEFAULT_LANGUAGE);
}

export function exemplarOption(command: Command) {
  utils.optionForConfigSchema(command, CONFIG_EXEMPLARS);
}

export function styleGuideOption(command: Command) {
  utils.optionForConfigSchema(command, CONFIG_STYLE_GUIDES);
}

export const DEFAULT_CONTENT_STRATEGY = "everything";

export function contextOptions(command: Command) {
  utils.optionForConfigSchema(command, CONFIG_CONTEXT_STRATEGY);
}

export function contentDirOption(command: Command) {
  utils.optionForConfigSchema(command, CONFIG_CONTENT_DIR);
}

export function checkOptions(command: Command) {
  utils.optionForConfigSchema(command, CONFIG_CHECK_LINK_TIMEOUT);
  utils.optionForConfigSchema(command, CONFIG_CHECK_SKIP_EXTERNAL_LINKS);
  utils.optionForConfigSchema(command, CONFIG_CHECK_LINK_IGNORE_PATTERNS);
  utils.optionForConfigSchema(command, CONFIG_CHECK_LINT_IGNORE_RULES);
  utils.optionForConfigSchema(command, CONFIG_CHECK_MIN_SEVERITY);
  utils.optionForConfigSchema(command, CONFIG_CHECK_CATEGORIES);
  utils.optionForConfigSchema(command, CONFIG_STATIC_PREFIX);
  utils.optionForConfigSchema(command, CONFIG_STATIC_DIR);
}
