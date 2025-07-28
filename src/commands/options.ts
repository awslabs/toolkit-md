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
  CONFIG_BASE_DIR,
  CONFIG_CONTEXT_STRATEGY,
  CONFIG_DEFAULT_LANGUAGE,
  CONFIG_EXEMPLARS,
  CONFIG_LANGUAGE,
  CONFIG_MAX_TOKENS,
  CONFIG_MODEL,
  CONFIG_RATE_LIMIT_REQUESTS,
  CONFIG_RATE_LIMIT_TOKENS,
  CONFIG_STYLE_GUIDES,
  CONFIG_WRITE,
} from "../config/index.js";
import * as utils from "./utils.js";

export const DEFAULT_MODEL = "anthropic.claude-3-5-sonnet-20241022-v2:0";
export const DEFAULT_MAX_TOKENS = "4096";

export function commonOptions(command: Command) {
  utils.optionForConfigSchema(command, CONFIG_BASE_DIR);
  utils.optionForConfigSchema(command, CONFIG_MODEL);
  utils.optionForConfigSchema(command, CONFIG_MAX_TOKENS);
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
