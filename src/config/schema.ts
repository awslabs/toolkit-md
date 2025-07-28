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
 * Configuration schema definition using Zod's native description functionality
 */

import { z } from "zod";
import { Language } from "../languages/index.js";

// Extend Zod's ZodType to include our metadata
declare module "zod" {
  interface ZodType {
    cli: string;
    env?: string;
    envPrefix?: string;
  }
}

// Helper function to add CLI and environment metadata to a schema
function withConfig<T extends z.ZodType>(
  schema: T,
  cli: string,
  env?: string,
  envPrefix?: string,
): T {
  // Add metadata to the schema
  schema.cli = cli;
  schema.env = env;
  schema.envPrefix = envPrefix;
  return schema;
}

export const CONFIG_BASE_DIR = withConfig(
  z
    .string()
    .describe("Directory to use as a base for other paths")
    .default("."),
  "baseDir",
  "TKMD_BASE_DIR",
);

export const CONFIG_LANGUAGE = withConfig(
  z
    .custom<string>((val) => Language.getLanguageMap().has(val), {
      message: "Unsupported default language",
    })
    .describe("Language to use as the source")
    .default("en"),
  "language",
  "TKMD_LANGUAGE",
);

export const CONFIG_DEFAULT_LANGUAGE = withConfig(
  z
    .custom<string>((val) => Language.getLanguageMap().has(val), {
      message: "Unsupported default language",
    })
    .describe("Language for files with no explicit language marker")
    .default("en"),
  "defaultLanguage",
  "TKMD_DEFAULT_LANGUAGE",
);

export const CONFIG_MODEL = withConfig(
  z
    .string()
    .describe("AWS Bedrock model ID")
    .default("anthropic.claude-3-5-sonnet-20241022-v2:0"),
  "model",
  "TKMD_AI_MODEL",
);

export const CONFIG_MAX_TOKENS = withConfig(
  z
    .union([
      z.number().positive("Max tokens must be greater than 0"),
      z.string().transform((val) => parseInt(val, 10)),
    ])
    .describe("Maximum tokens to be output by the model")
    .default(4096),
  "maxTokens",
  "TKMD_AI_MAX_TOKENS",
);

export const CONFIG_WRITE = withConfig(
  z
    .boolean()
    .describe("Write proposed changes to the source files")
    .default(false),
  "write",
  "TKMD_AI_WRITE",
);

export const CONFIG_RATE_LIMIT_REQUESTS = withConfig(
  z
    .union([
      z.number().min(0, "Rate limit cannot be negative"),
      z.string().transform((val) => Math.max(0, Math.floor(Number(val)))),
    ])
    .describe("Maximum requests per minute to send to the LLM")
    .default(0),
  "requestRate",
  "TKMD_AI_REQUEST_RATE_LIMIT",
);

export const CONFIG_RATE_LIMIT_TOKENS = withConfig(
  z
    .union([
      z.number().min(0, "Token rate limit cannot be negative"),
      z.string().transform((val) => Math.max(0, Math.floor(Number(val)))),
    ])
    .describe("Maximum tokens per minute to send to the LLM")
    .default(0),
  "tokenRate",
  "TKMD_AI_TOKEN_RATE_LIMIT",
);

export const CONFIG_FORCE_TRANSLATION = withConfig(
  z
    .boolean()
    .describe("Force translation even if the source file has not changed")
    .default(false),
  "force",
  "TKMD_AI_FORCE_TRANSLATION",
);

export const CONFIG_CHECK_TRANSLATION = withConfig(
  z
    .boolean()
    .describe("Only check if any files require translation")
    .default(false),
  "check",
  "TKMD_AI_CHECK_TRANSLATION",
);

export const CONFIG_CONTEXT_STRATEGY = withConfig(
  z
    .enum(["siblings", "nothing", "everything"])
    .describe("Strategy for including context")
    .default("nothing"),
  "contextStrategy",
  "TKMD_AI_CONTEXT_STRATEGY",
);

export const CONFIG_EXEMPLARS = withConfig(
  z.array(z.string()).describe("Paths to example content").default([]),
  "exemplar",
  undefined,
  "TKMD_AI_EXEMPLAR",
);

export const CONFIG_STYLE_GUIDES = withConfig(
  z
    .array(z.string())
    .describe("Paths to documents containing style guides")
    .default([]),
  "styleGuide",
  undefined,
  "TKMD_AI_STYLE_GUIDE",
);

// Define the configuration schema using Zod's native description functionality
export const configSchema = z.object({
  baseDir: CONFIG_BASE_DIR,
  language: CONFIG_LANGUAGE,
  defaultLanguage: CONFIG_DEFAULT_LANGUAGE,
  ai: z.object({
    model: CONFIG_MODEL,
    maxTokens: CONFIG_MAX_TOKENS,
    write: CONFIG_WRITE,
    rate: z.object({
      requests: CONFIG_RATE_LIMIT_REQUESTS,
      tokens: CONFIG_RATE_LIMIT_TOKENS,
    }),
    contextStrategy: CONFIG_CONTEXT_STRATEGY,
    exemplars: CONFIG_EXEMPLARS,
    styleGuides: CONFIG_STYLE_GUIDES,
    translation: z.object({
      force: CONFIG_FORCE_TRANSLATION,
      check: CONFIG_CHECK_TRANSLATION,
    }),
  }),
});

// Extract TypeScript type from the schema
export type Config = z.infer<typeof configSchema>;
