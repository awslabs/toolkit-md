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
 * @fileoverview Workspace bootstrap for the application core.
 *
 * Encapsulates the project setup ritual shared by every entry point (CLI
 * commands and MCP tools): configuration loading, language resolution,
 * directory resolution, content tree construction, and style guide and
 * exemplar loading. Transports create a Workspace and pass it to core
 * services instead of wiring these pieces together themselves.
 */

import * as fs from "node:fs";
import path from "node:path";
import type { ContextStrategy, Exemplar } from "../ai/index.js";
import type { CheckOptions } from "../check/types.js";
import { type Config, ConfigManager } from "../config/index.js";
import { ContentTree, FileSystemProvider } from "../content/index.js";
import { Language } from "../languages/index.js";
import type { LogWriter } from "./logger.js";
import { NoopLogger } from "./logger.js";

export interface WorkspaceOptions {
  /** CLI or tool options forwarded to the ConfigManager */
  cliOptions?: Record<string, unknown>;

  /** Logger for workspace setup progress messages */
  logger?: LogWriter;
}

/**
 * Resolves a possibly-relative file path against a context directory.
 *
 * @param filepath - The path to resolve
 * @param contextPath - Base directory for relative paths
 * @returns The resolved path, or the input unchanged if absolute or empty
 */
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

/**
 * Validates that a target path resolves inside the given working directory.
 *
 * @param targetPath - Path to validate
 * @param cwd - Working directory that must contain the target
 * @throws {Error} When the target resolves outside the working directory
 */
export function validatePathWithinCwd(targetPath: string, cwd: string): void {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedCwd = path.resolve(cwd);
  const relative = path.relative(resolvedCwd, resolvedTarget);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      `Access denied: path '${targetPath}' is outside the working directory`,
    );
  }
}

/**
 * Determines whether prompt caching should be enabled for a context strategy.
 *
 * Caching only pays off when the prompt carries a large shared context
 * prefix, so it is disabled for the "nothing" strategy.
 *
 * @param contextStrategy - The configured context strategy
 * @returns Whether prompt caching should be enabled
 */
export function shouldEnableCache(contextStrategy: ContextStrategy): boolean {
  return contextStrategy !== "nothing";
}

/**
 * Loads ignore words from a file, one word per line.
 *
 * @param filePath - Path to the ignore words file
 * @param cwd - Current working directory for resolving relative paths
 * @returns Array of words to ignore
 */
export async function loadIgnoreWordsFile(
  filePath: string,
  cwd: string,
): Promise<string[]> {
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(path.join(cwd, filePath));

  const content = await fs.promises.readFile(resolvedPath, "utf8");
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * Builds a content tree from a directory using the filesystem provider.
 *
 * @param contentPath - Directory to load content from
 * @param defaultLanguage - Language for files without a language suffix
 * @param language - Language to filter content by
 * @param includeLanguageSuffix - Whether created files include a language suffix
 * @returns The populated content tree
 */
export async function buildContentTree(
  contentPath: string,
  defaultLanguage: Language,
  language: Language,
  includeLanguageSuffix: boolean = true,
): Promise<ContentTree> {
  const provider = new FileSystemProvider(contentPath);
  const entries = await provider.loadContent();
  const tree = new ContentTree(provider, {
    defaultLanguage: defaultLanguage.code,
    language: language.code,
    includeLanguageSuffix,
  });
  entries.forEach(({ path, content }) => tree.add(path, content));

  return tree;
}

/**
 * A fully bootstrapped project workspace.
 *
 * Provides resolved configuration, languages, and directories, plus
 * factories for content trees, style guides, and exemplars. Created via
 * {@link Workspace.create}.
 */
export class Workspace {
  private constructor(
    public readonly cwd: string,
    public readonly config: ConfigManager,
    /** Fully resolved, typed configuration */
    public readonly settings: Config,
    public readonly language: Language,
    public readonly defaultLanguage: Language,
    private readonly logger: LogWriter,
  ) {}

  /**
   * Creates a workspace rooted at the given directory.
   *
   * @param cwd - Project root directory
   * @param options - CLI options and logger
   * @returns The initialized workspace
   */
  static async create(
    cwd: string,
    options: WorkspaceOptions = {},
  ): Promise<Workspace> {
    const config = new ConfigManager(cwd);
    await config.initialize(options.cliOptions ?? {});

    const settings = config.resolve();

    const language = Language.getLanguage(settings.language);

    if (!language) {
      throw new Error("Language not set");
    }

    const defaultLanguage = Language.getLanguage(settings.defaultLanguage);

    if (!defaultLanguage) {
      throw new Error("Default language not set");
    }

    return new Workspace(
      cwd,
      config,
      settings,
      language,
      defaultLanguage,
      options.logger ?? new NoopLogger(),
    );
  }

  /**
   * Resolves the configured content directory, if set.
   *
   * @returns Absolute path to the content directory, or undefined
   */
  getContentDir(): string | undefined {
    const contentDir = this.settings.contentDir;

    if (!contentDir) {
      return undefined;
    }

    return path.resolve(path.join(this.config.getCwd(), contentDir));
  }

  /**
   * Resolves a target path under the configured content directory.
   *
   * @param target - Target path relative to the content directory
   * @returns Absolute path to the target content
   */
  getContentDirWithTarget(target: string): string {
    let contentDir = this.settings.contentDir;

    if (!contentDir) {
      contentDir = target;
    } else {
      contentDir = path.join(contentDir, target);
    }

    if (path.isAbsolute(contentDir)) {
      return contentDir;
    }

    return path.resolve(path.join(this.config.getCwd(), contentDir));
  }

  /**
   * Resolves the translation output directory.
   *
   * @param contentDir - Source content directory used as the default
   * @returns The resolved directory and whether it was explicitly overridden
   */
  getTranslationDir(contentDir: string): {
    translationDir: string;
    overridden: boolean;
  } {
    let translationDir = this.settings.ai.translation.directory;
    let overridden = true;

    if (!translationDir) {
      overridden = false;
      translationDir = contentDir;
    }

    if (path.isAbsolute(translationDir)) {
      return { translationDir, overridden };
    }

    return {
      translationDir: path.resolve(
        path.join(this.config.getCwd(), translationDir),
      ),
      overridden,
    };
  }

  /**
   * Resolves the static assets directory, if configured.
   *
   * @returns Absolute path to the static directory, or undefined
   */
  getStaticDir(): string | undefined {
    const staticDir = this.settings.staticDir;

    if (!staticDir) {
      return undefined;
    }

    if (path.isAbsolute(staticDir)) {
      return staticDir;
    }

    return path.resolve(path.join(this.config.getCwd(), staticDir));
  }

  /**
   * Builds check options from workspace configuration.
   *
   * @param contentDir - Directory containing the content being checked
   * @param options - Optional root directory and locale overrides
   * @returns Check options for the check module
   */
  async getCheckConfig(
    contentDir: string,
    options?: {
      rootContentDir?: string;
      locale?: string;
    },
  ): Promise<CheckOptions> {
    const check = this.settings.check;
    const ignoreWordsFile = check.spell.ignoreWordsFile;
    const ignoreWords = ignoreWordsFile
      ? await loadIgnoreWordsFile(ignoreWordsFile, this.config.getCwd())
      : [];

    return {
      contentDir,
      rootContentDir: options?.rootContentDir,
      links: {
        timeout: check.links.timeout,
        skipExternal: check.links.skipExternal,
        ignorePatterns: check.links.ignorePatterns,
      },
      lint: {
        ignoreRules: check.lint.ignoreRules,
      },
      spell: {
        ignoreWords,
        skipDirectives: check.spell.skipDirectives,
        locale: options?.locale ?? this.settings.language,
      },
      staticPrefix: this.settings.staticPrefix,
      staticDir: this.getStaticDir(),
      minSeverity: check.minSeverity,
      categories: check.categories,
    };
  }

  /**
   * Returns the configured context strategy for AI prompts.
   *
   * @returns The validated context strategy
   */
  getContextStrategy(): ContextStrategy {
    return this.settings.ai.contextStrategy;
  }

  /**
   * Builds a content tree for the given directory using workspace languages.
   *
   * @param contentPath - Directory to load content from
   * @param overrides - Optional language and suffix overrides
   * @returns The populated content tree
   */
  async buildTree(
    contentPath: string,
    overrides?: {
      language?: Language;
      defaultLanguage?: Language;
      includeLanguageSuffix?: boolean;
    },
  ): Promise<ContentTree> {
    return buildContentTree(
      contentPath,
      overrides?.defaultLanguage ?? this.defaultLanguage,
      overrides?.language ?? this.language,
      overrides?.includeLanguageSuffix ?? true,
    );
  }

  /**
   * Loads exemplar content trees from the configured exemplar paths.
   *
   * @returns Array of exemplars with their flattened content nodes
   */
  async getExemplars(): Promise<Exemplar[]> {
    const exemplarPaths = this.settings.ai.exemplars;

    const exemplars: Exemplar[] = [];

    for (const exemplar of exemplarPaths) {
      const tree = await this.buildTree(buildPath(exemplar, this.cwd));

      exemplars.push({
        path: exemplar,
        nodes: tree.getFlattenedTree(),
      });
    }

    return exemplars;
  }

  /**
   * Loads style guide content from the configured paths.
   *
   * Paths may point to individual files or directories of localized
   * content, in which case the given languages are loaded.
   *
   * @param languages - Languages to load from style guide directories
   * @returns Array of style guide contents
   */
  async getStyleGuides(languages?: Language[]): Promise<string[]> {
    const styleGuides = this.settings.ai.styleGuides;
    const styleGuideFiles: string[] = [];

    if (styleGuides.length > 0) {
      this.logger.message(`📚 Using style guides:`);

      for (const styleGuidePath of styleGuides) {
        const resolvedPath = buildPath(styleGuidePath, this.cwd);

        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`Failed to load style guide ${resolvedPath}`);
        }

        const stats = fs.statSync(resolvedPath);

        const resolvedLanguages = languages ?? [this.defaultLanguage];

        if (stats.isDirectory()) {
          this.logger.message(`  - ${styleGuidePath}/`);

          for (const language of resolvedLanguages) {
            const tree = await this.buildTree(resolvedPath, {
              language,
              defaultLanguage: language,
            });
            const contentFiles = tree.getNodes();

            for (const contentFile of contentFiles) {
              if (contentFile.filePath && contentFile.content) {
                this.logger.message(`  -> ${contentFile.filePath}`);

                styleGuideFiles.push(contentFile.content);
              }
            }
          }
        } else {
          this.logger.message(`  - ${styleGuidePath}`);

          const content = fs.readFileSync(resolvedPath, "utf8");

          styleGuideFiles.push(content);
        }
      }
    }

    return styleGuideFiles;
  }
}
