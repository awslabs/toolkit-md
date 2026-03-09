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
import {
  ZodArray,
  ZodDefault,
  ZodError,
  ZodObject,
  ZodOptional,
  type z,
} from "zod";
import { type Config, configSchema } from "./schema.js";

const CONFIG_FILE_NAMES = [
  ".toolkit-mdrc.json",
  ".toolkit-mdrc",
  "toolkit-md.config.json",
];

interface ConfigEntry {
  schema: z.ZodType;
  cli?: string;
  env?: string;
  envPrefix?: string;
  isArray: boolean;
}

export class ConfigManager {
  private fileConfig: Partial<Config> = {};
  private configFilePath: string | null = null;
  private cliOptions: any = {};
  private entries: Map<string, ConfigEntry>;

  constructor(
    private cwd: string,
    private schema = configSchema,
  ) {
    this.entries = new Map();
    this.buildEntries(this.schema, "");
  }

  public getCwd() {
    return this.cwd;
  }

  /**
   * Initialize the configuration manager by loading config files
   * @param cliOptions Command line options from Commander
   * @param configPath Optional explicit path to config file
   */
  public async initialize(
    cliOptions: any = {},
    configPath?: string,
  ): Promise<void> {
    this.cliOptions = cliOptions;
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
    const entry = this.entries.get(path);

    if (!entry) {
      throw new Error(`Config path ${path} is not valid`);
    }

    let value: any;

    if (entry.cli && this.cliOptions[entry.cli] !== undefined) {
      value = this.cliOptions[entry.cli];
    } else if (entry.env) {
      const envVars = Array.isArray(entry.env) ? entry.env : [entry.env];
      for (const envVar of envVars) {
        if (process.env[envVar] !== undefined) {
          value = process.env[envVar];
          break;
        }
      }
    }

    if (value === undefined && entry.isArray && entry.envPrefix) {
      const values: any[] = [];
      for (const [key, val] of Object.entries(process.env)) {
        if (key.startsWith(`${entry.envPrefix}_`) && val) {
          values.push(val);
        }
      }
      if (values.length > 0) {
        value = values;
      }
    }

    if (value === undefined) {
      const fileValue = this.getNestedProperty<any>(this.fileConfig, path);
      if (fileValue !== undefined) {
        value = fileValue;
      }
    }

    if (value === undefined) {
      value = defaultOverride;
    }

    try {
      return entry.schema.parse(value) as T;
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.issues.map((e) => e.message).join(", ");
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

  private buildEntries(schema: z.ZodType, prefix: string): void {
    if (schema instanceof ZodObject) {
      for (const [key, value] of Object.entries(
        (schema as ZodObject<any>).shape,
      )) {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        this.buildEntries(value as z.ZodType, fullPath);
      }
      return;
    }

    const meta = schema.meta() as z.GlobalMeta | undefined;
    const isArray = this.unwrapSchema(schema) instanceof ZodArray;

    this.entries.set(prefix, {
      schema,
      cli: meta?.cli,
      env: meta?.env,
      envPrefix: meta?.envPrefix,
      isArray,
    });
  }

  private unwrapSchema(schema: z.ZodType): z.ZodType {
    if (schema instanceof ZodDefault) {
      return (schema as ZodDefault<any>)._zod.def.innerType as z.ZodType;
    }
    if (schema instanceof ZodOptional) {
      return (schema as ZodOptional<any>)._zod.def.innerType as z.ZodType;
    }
    return schema;
  }

  /**
   * Find and load configuration from a JSON file
   * @param explicitPath Optional explicit path to config file
   */
  private async loadFromConfigFile(explicitPath?: string): Promise<void> {
    try {
      let configFilePath: string | null = null;

      if (explicitPath) {
        if (fs.existsSync(explicitPath)) {
          configFilePath = explicitPath;
        }
      }

      if (!configFilePath) {
        for (const fileName of CONFIG_FILE_NAMES) {
          const filePath = path.join(this.cwd, fileName);
          if (fs.existsSync(filePath)) {
            configFilePath = filePath;
            break;
          }
        }
      }

      if (!configFilePath) {
        for (const fileName of CONFIG_FILE_NAMES) {
          const filePath = path.join(os.homedir(), fileName);
          if (fs.existsSync(filePath)) {
            configFilePath = filePath;
            break;
          }
        }
      }

      if (configFilePath) {
        const fileContent = await fs.promises.readFile(configFilePath, "utf8");
        this.fileConfig = JSON.parse(fileContent);
        this.configFilePath = configFilePath;
      } else {
        this.fileConfig = {};
      }
    } catch (error: any) {
      throw new Error(`Failed to load config file: ${error.message}`);
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
