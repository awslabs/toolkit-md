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

import { z } from "zod";
import { Language } from "../languages/index.js";

declare module "zod" {
  interface GlobalMeta {
    cli?: string;
    env?: string;
    envPrefix?: string;
  }
}

export const CONFIG_CONTENT_DIR = z
  .string()
  .optional()
  .describe("Directory relative to the cwd where content is hosted")
  .meta({ cli: "contentDir", env: "TKMD_CONTENT_DIR" });

export const CONFIG_LANGUAGE = z
  .custom<string>((val) => Language.getLanguageMap().has(val as string), {
    message: "Unsupported default language",
  })
  .default("en")
  .describe("Language to use as the source")
  .meta({ cli: "language", env: "TKMD_LANGUAGE" });

export const CONFIG_DEFAULT_LANGUAGE = z
  .custom<string>((val) => Language.getLanguageMap().has(val as string), {
    message: "Unsupported default language",
  })
  .default("en")
  .describe("Language for files with no explicit language marker")
  .meta({ cli: "defaultLanguage", env: "TKMD_DEFAULT_LANGUAGE" });

export const CONFIG_MODEL = z
  .string()
  .default("global.anthropic.claude-sonnet-4-5-20250929-v1:0")
  .describe("AWS Bedrock model ID")
  .meta({ cli: "model", env: "TKMD_AI_MODEL" });

export const CONFIG_MAX_TOKENS = z
  .union([
    z.number().positive("Max tokens must be greater than 0"),
    z.string().transform((val) => parseInt(val, 10)),
  ])
  .default(4096)
  .describe("Maximum tokens to be output by the model")
  .meta({ cli: "maxTokens", env: "TKMD_AI_MAX_TOKENS" });

export const CONFIG_WRITE = z
  .boolean()
  .default(false)
  .describe("Write proposed changes to the source files")
  .meta({ cli: "write", env: "TKMD_AI_WRITE" });

export const CONFIG_RATE_LIMIT_REQUESTS = z
  .union([
    z.number().min(0, "Rate limit cannot be negative"),
    z.string().transform((val) => Math.max(0, Math.floor(Number(val)))),
  ])
  .default(0)
  .describe("Maximum requests per minute to send to the LLM")
  .meta({ cli: "requestRate", env: "TKMD_AI_REQUEST_RATE_LIMIT" });

export const CONFIG_RATE_LIMIT_TOKENS = z
  .union([
    z.number().min(0, "Token rate limit cannot be negative"),
    z.string().transform((val) => Math.max(0, Math.floor(Number(val)))),
  ])
  .default(0)
  .describe("Maximum tokens per minute to send to the LLM")
  .meta({ cli: "tokenRate", env: "TKMD_AI_TOKEN_RATE_LIMIT" });

export const CONFIG_REVIEW_SUMMARY_PATH = z
  .string()
  .default("")
  .describe("Write summary to this file")
  .meta({ cli: "summaryPath", env: "TKMD_AI_REVIEW_SUMMARY_PATH" });

export const CONFIG_REVIEW_INSTRUCTIONS = z
  .string()
  .optional()
  .describe("Additional instructions for the model")
  .meta({ cli: "instructions", env: "TKMD_REVIEW_INSTRUCTIONS" });

export const CONFIG_REVIEW_DIFF_FILE = z
  .string()
  .optional()
  .describe("Path to unified diff file for filtering review suggestions")
  .meta({ cli: "diffFile", env: "TKMD_AI_REVIEW_DIFF_FILE" });

export const CONFIG_REVIEW_DIFF_CONTEXT = z
  .union([
    z.number().nonnegative("Diff context must be non-negative"),
    z.string().transform((val) => parseInt(val, 10)),
  ])
  .default(3)
  .describe(
    "Number of context lines around changed lines to include (symmetric)",
  )
  .meta({ cli: "diffContext", env: "TKMD_AI_REVIEW_DIFF_CONTEXT" });

export const CONFIG_REVIEW_CHECK = z
  .boolean()
  .default(true)
  .describe(
    "Run content checks (lint, links, images) and include results in the review prompt",
  )
  .meta({ cli: "reviewCheck", env: "TKMD_AI_REVIEW_CHECK" });

export const CONFIG_FORCE_TRANSLATION = z
  .boolean()
  .default(false)
  .describe("Force translation even if the source file has not changed")
  .meta({ cli: "force", env: "TKMD_AI_FORCE_TRANSLATION" });

export const CONFIG_CHECK_TRANSLATION = z
  .boolean()
  .default(false)
  .describe("Only check if any files require translation")
  .meta({ cli: "check", env: "TKMD_AI_CHECK_TRANSLATION" });

export const CONFIG_TRANSLATION_DIR = z
  .string()
  .optional()
  .describe(
    "Directory where translated content is stored, if not specified defaults to source directory",
  )
  .meta({ cli: "translationDir", env: "TKMD_AI_TRANSLATION_DIRECTORY" });

export const CONFIG_TRANSLATION_SKIP_SUFFIX = z
  .boolean()
  .default(false)
  .describe(
    "Omit the language code suffix for translated files ('example.fr.md' becomes 'example.md')",
  )
  .meta({
    cli: "skipFileSuffix",
    env: "TKMD_AI_TRANSLATION_SKIP_FILE_SUFFIX",
  });

export const CONFIG_CONTEXT_STRATEGY = z
  .enum(["siblings", "nothing", "everything"])
  .default("nothing")
  .describe("Strategy for including context")
  .meta({ cli: "contextStrategy", env: "TKMD_AI_CONTEXT_STRATEGY" });

export const CONFIG_EXEMPLARS = z
  .array(z.string())
  .default([])
  .describe("Paths to example content")
  .meta({ cli: "exemplar", envPrefix: "TKMD_AI_EXEMPLAR" });

export const CONFIG_STYLE_GUIDES = z
  .array(z.string())
  .default([])
  .describe("Paths to documents containing style guides")
  .meta({ cli: "styleGuide", envPrefix: "TKMD_AI_STYLE_GUIDE" });

export const CONFIG_INCLUDE_IMAGES = z
  .boolean()
  .default(false)
  .describe("Include images from markdown files in AI review")
  .meta({ cli: "includeImages", env: "TKMD_AI_INCLUDE_IMAGES" });

export const CONFIG_MAX_IMAGES = z
  .union([
    z.number().positive("Max images must be greater than 0"),
    z.string().transform((val) => parseInt(val, 10)),
  ])
  .default(5)
  .describe("Maximum number of images to include per file")
  .meta({ cli: "maxImages", env: "TKMD_AI_MAX_IMAGES" });

export const CONFIG_MAX_IMAGE_SIZE = z
  .union([
    z.number().positive("Max image size must be greater than 0"),
    z.string().transform((val) => parseInt(val, 10)),
  ])
  .default(3145728)
  .describe("Maximum image file size in bytes")
  .meta({ cli: "maxImageSize", env: "TKMD_AI_MAX_IMAGE_SIZE" });

export const CONFIG_CHECK_LINK_TIMEOUT = z
  .union([
    z.number().positive("Link timeout must be greater than 0"),
    z.string().transform((val) => Number.parseInt(val, 10)),
  ])
  .default(5000)
  .describe("Timeout in milliseconds for HTTP link checks")
  .meta({ cli: "linkTimeout", env: "TKMD_CHECK_LINK_TIMEOUT" });

export const CONFIG_CHECK_SKIP_EXTERNAL_LINKS = z
  .boolean()
  .default(false)
  .describe("Skip validation of external HTTP/HTTPS links")
  .meta({ cli: "skipExternalLinks", env: "TKMD_CHECK_SKIP_EXTERNAL_LINKS" });

export const CONFIG_CHECK_LINK_IGNORE_PATTERNS = z
  .array(z.string())
  .default([])
  .describe("Regex patterns for URLs to ignore during link checking")
  .meta({
    cli: "ignoreLinkPattern",
    envPrefix: "TKMD_CHECK_LINK_IGNORE_PATTERN",
  });

export const CONFIG_CHECK_LINT_IGNORE_RULES = z
  .array(z.string())
  .default([])
  .describe(
    "remark-lint rule names to ignore (without the remark-lint- prefix)",
  )
  .meta({ cli: "ignoreRule", envPrefix: "TKMD_CHECK_LINT_IGNORE_RULE" });

export const CONFIG_CHECK_MIN_SEVERITY = z
  .enum(["error", "warning"])
  .default("warning")
  .describe("Minimum severity level to report")
  .meta({ cli: "minSeverity", env: "TKMD_CHECK_MIN_SEVERITY" });

export const CONFIG_CHECK_CATEGORIES = z
  .array(z.enum(["lint", "link", "image"]))
  .default(["lint", "link", "image"])
  .describe("Check categories to run")
  .meta({ cli: "category", envPrefix: "TKMD_CHECK_CATEGORY" });

export const CONFIG_STATIC_PREFIX = z
  .string()
  .optional()
  .describe(
    "URL prefix that indicates a link points to a file in the static directory",
  )
  .meta({ cli: "staticPrefix", env: "TKMD_STATIC_PREFIX" });

export const CONFIG_STATIC_DIR = z
  .string()
  .optional()
  .describe(
    "Directory relative to the cwd where static assets are stored, used with staticPrefix",
  )
  .meta({ cli: "staticDir", env: "TKMD_STATIC_DIR" });

export const configSchema = z.object({
  contentDir: CONFIG_CONTENT_DIR,
  language: CONFIG_LANGUAGE,
  defaultLanguage: CONFIG_DEFAULT_LANGUAGE,
  staticPrefix: CONFIG_STATIC_PREFIX,
  staticDir: CONFIG_STATIC_DIR,
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
    includeImages: CONFIG_INCLUDE_IMAGES,
    maxImages: CONFIG_MAX_IMAGES,
    maxImageSize: CONFIG_MAX_IMAGE_SIZE,
    review: z.object({
      summaryPath: CONFIG_REVIEW_SUMMARY_PATH,
      instructions: CONFIG_REVIEW_INSTRUCTIONS,
      diffFile: CONFIG_REVIEW_DIFF_FILE,
      diffContext: CONFIG_REVIEW_DIFF_CONTEXT,
      runChecks: CONFIG_REVIEW_CHECK,
    }),
    translation: z.object({
      force: CONFIG_FORCE_TRANSLATION,
      check: CONFIG_CHECK_TRANSLATION,
      directory: CONFIG_TRANSLATION_DIR,
      skipFileSuffix: CONFIG_TRANSLATION_SKIP_SUFFIX,
    }),
  }),
  check: z.object({
    minSeverity: CONFIG_CHECK_MIN_SEVERITY,
    categories: CONFIG_CHECK_CATEGORIES,
    links: z.object({
      timeout: CONFIG_CHECK_LINK_TIMEOUT,
      skipExternal: CONFIG_CHECK_SKIP_EXTERNAL_LINKS,
      ignorePatterns: CONFIG_CHECK_LINK_IGNORE_PATTERNS,
    }),
    lint: z.object({
      ignoreRules: CONFIG_CHECK_LINT_IGNORE_RULES,
    }),
  }),
});

export type Config = z.infer<typeof configSchema>;
