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

/** biome-ignore-all lint/suspicious/noExplicitAny: Need better way to handle these types */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { type Config, configSchema } from "./schema.js";

const CONFIG_FILE_NAMES = [
  ".toolkit-mdrc.json",
  ".toolkit-mdrc",
  "toolkit-md.config.json",
];

export class ConfigManager {
  private fileConfig: Partial<Config> = {};
  private configFilePath: string | null = null;
  private cliOptions: any = {};

  constructor(private schema = configSchema) {}

  /**
   * Initialize the configuration manager by loading config files
   * @param cliOptions Command line options from Commander
   * @param configPath Optional explicit path to config file
   */
  public async initialize(
    cliOptions: any = {},
    configPath?: string,
  ): Promise<void> {
    // Store CLI options for later use
    this.cliOptions = cliOptions;

    // Load configuration from file(s)
    await this.loadFromConfigFile(configPath);
  }

  /**
   * Get a configuration value by checking sources in precedence order:
   * 1. CLI options (highest priority)
   * 2. Environment variables
   * 3. Config file
   * 4. Default value (lowest priority)
   *
   * Also performs validation and transformation using Zod.
   *
   * @param path Configuration key path using dot notation
   * @param defaultOverride Optional default value override
   * @throws Error if validation fails
   */
  public get<T>(path: string, defaultOverride?: T): T {
    // Find the schema node for this path
    const schemaNode = this.getSchemaNodeForPath(path);

    if (!schemaNode) {
      throw new Error(`Config path ${path} is not valid`);
    }

    let value: any;

    // 1. Check CLI options (highest priority)
    if (schemaNode.cli && this.cliOptions[schemaNode.cli] !== undefined) {
      value = this.cliOptions[schemaNode.cli];
    }
    // 2. Check environment variables
    else if (schemaNode.env) {
      const envVars = Array.isArray(schemaNode.env)
        ? schemaNode.env
        : [schemaNode.env];

      for (const envVar of envVars) {
        if (process.env[envVar] !== undefined) {
          value = process.env[envVar];
          break;
        }
      }
    }

    // Special handling for array values from environment variables with prefix
    if (
      value === undefined &&
      schemaNode._def.innerType instanceof z.ZodArray &&
      schemaNode.envPrefix
    ) {
      const values: any[] = [];

      // Collect all environment variables with the prefix
      for (const [key, val] of Object.entries(process.env)) {
        if (key.startsWith(schemaNode.envPrefix + ("_" as const)) && val) {
          values.push(val);
        }
      }

      // If we found any values, use them
      if (values.length > 0) {
        value = values;
      }
    }

    // 3. Check config file
    if (value === undefined) {
      const fileValue = this.getNestedProperty<any>(this.fileConfig, path);
      if (fileValue !== undefined) {
        value = fileValue;
      }
    }

    // 4. Use default value from schema or provided override
    if (value === undefined) {
      value = defaultOverride;
    }

    // Validate and transform using Zod
    try {
      // Parse the value through the schema node
      const result = schemaNode.parse(value);
      return result as T;
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Format Zod error messages
        const errorMessages = error.errors.map((e) => e.message).join(", ");
        throw new Error(`Invalid configuration for ${path}: ${errorMessages}`);
      }
      throw error;
    }
  }

  /**
   * Get the path to the loaded config file, if any
   */
  public getConfigFilePath(): string | null {
    return this.configFilePath;
  }

  /**
   * Find the schema node for a given path
   */
  private getSchemaNodeForPath(path: string): z.ZodDefault<any> | undefined {
    const keys = path.split(".");
    let current: any = this.schema;

    for (const key of keys) {
      if (!current) return undefined;

      // Handle object schemas
      if (current instanceof z.ZodObject) {
        const shape = current._def.shape();
        current = shape[key];
      }
      // Handle array schemas
      else if (current instanceof z.ZodArray && !Number.isNaN(key)) {
        current = current.element;
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Find and load configuration from a JSON file
   * @param explicitPath Optional explicit path to config file
   */
  private async loadFromConfigFile(explicitPath?: string): Promise<void> {
    try {
      let configFilePath: string | null = null;

      // 1. Try explicit path if provided
      if (explicitPath) {
        if (fs.existsSync(explicitPath)) {
          configFilePath = explicitPath;
        } else {
          // Silently continue to other config file locations
        }
      }

      // 2. Try current directory
      if (!configFilePath) {
        for (const fileName of CONFIG_FILE_NAMES) {
          const filePath = path.join(process.cwd(), fileName);
          if (fs.existsSync(filePath)) {
            configFilePath = filePath;
            break;
          }
        }
      }

      // 3. Try home directory
      if (!configFilePath) {
        for (const fileName of CONFIG_FILE_NAMES) {
          const filePath = path.join(os.homedir(), fileName);
          if (fs.existsSync(filePath)) {
            configFilePath = filePath;
            break;
          }
        }
      }

      // If we found a config file, load and parse it
      if (configFilePath) {
        const fileContent = await fs.promises.readFile(configFilePath, "utf8");
        this.fileConfig = JSON.parse(fileContent);
        this.configFilePath = configFilePath;
      } else {
        // No config file found, use empty object
        this.fileConfig = {};
      }
    } catch {
      // Reset to empty object on error
      this.fileConfig = {};
      // Don't throw here to allow the application to continue without a config file
    }
  }

  /**
   * Get a nested property from an object using a dot-notation path
   */
  private getNestedProperty<T>(obj: any, path: string, defaultValue?: T): T {
    const keys = path.split(".");
    let current = obj;

    for (const key of keys) {
      if (current === undefined || current === null) {
        return defaultValue as T;
      }
      current = current[key];
    }

    return current === undefined ? (defaultValue as T) : (current as T);
  }
}

// Export a singleton instance
export const zodNativeConfigManager = new ConfigManager();
