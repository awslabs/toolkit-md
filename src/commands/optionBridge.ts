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
 * @fileoverview Bridge between the Zod configuration schema and Commander.
 *
 * Generates CLI options from configuration schema entries using their
 * attached metadata (CLI flag name, environment variable, defaults).
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: Zod internals access */

import { type Command, Option } from "commander";
import type z from "zod";
import { ZodArray, ZodBoolean, ZodDefault } from "zod";
import { unwrapSchema } from "../config/index.js";

export function collect(value: unknown, previous: unknown[]) {
  return (previous ?? []).concat([value]);
}

/**
 * Adds a CLI option to a command derived from a config schema entry.
 *
 * @param command - Commander command to add the option to
 * @param schema - Config schema entry carrying CLI metadata
 * @returns The command for chaining
 */
export function optionForConfigSchema(command: Command, schema: z.ZodType) {
  const meta = schema.meta() as z.GlobalMeta | undefined;
  const cli = meta?.cli ?? "";
  const flags = camelToOptionFlag(cli);
  const inner = unwrapSchema(schema);

  let flagString = `${flags} <value>`;

  if (inner instanceof ZodBoolean) {
    flagString = flags;
  }

  const option = new Option(flagString, optionDescriptionFromSchema(schema));

  if (inner instanceof ZodArray) {
    option.argParser(collect);
  }

  return command.addOption(option);
}

export function optionDescriptionFromSchema(schema: z.ZodType) {
  const meta = schema.meta() as z.GlobalMeta | undefined;
  const env = meta?.envPrefix ? `${meta.envPrefix}_*` : meta?.env;

  let defaultValue = "";

  if (schema instanceof ZodDefault) {
    defaultValue = `(default: ${JSON.stringify(
      (schema as ZodDefault<any>)._zod.def.defaultValue,
    )})`;
  }

  return `${schema.description} (${env}) ${defaultValue}`;
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
  const kebabCase = camelCase.replace(/([A-Z])/g, "-$1").toLowerCase();

  return `--${kebabCase}`;
}
