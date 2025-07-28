import os from "node:os";
import path from "node:path";
import mockFs from "mock-fs";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ConfigManager, configSchema } from "../../src/config/index.js";

describe("ZodConfigManager", () => {
  let configManager: ConfigManager;
  const originalEnv = { ...process.env };
  const homeDir = "/home/user";
  const currentDir = process.cwd();

  // Mock os.homedir to return a consistent path
  vi.spyOn(os, "homedir").mockReturnValue(homeDir);

  beforeEach(() => {
    // Reset environment variables
    process.env = { ...originalEnv };

    // Create a new ZodConfigManager with the test schema
    configManager = new ConfigManager(configSchema);
  });

  afterEach(() => {
    // Restore the real file system
    mockFs.restore();
  });

  afterAll(() => {
    // Restore environment variables
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("initialize", () => {
    it("should load configuration from a file in current directory", async () => {
      // Set up mock file system with a config file in the current directory
      mockFs({
        [path.join(currentDir, ".toolkit-mdrc.json")]: JSON.stringify({
          ai: {
            model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
            write: false,
          },
        }),
      });

      // Initialize with empty CLI options
      await configManager.initialize({});

      // Check that values from the file were loaded
      expect(configManager.get("ai.model")).toBe(
        "anthropic.claude-3-5-sonnet-20241022-v2:0",
      );
      expect(configManager.get("ai.write")).toBe(false);
      expect(configManager.getConfigFilePath()).toContain(".toolkit-mdrc.json");
    });

    it("should load configuration from a file in home directory", async () => {
      // Set up mock file system with a config file in the home directory
      mockFs({
        [path.join(homeDir, ".toolkit-mdrc.json")]: JSON.stringify({
          ai: {
            model: "anthropic.claude-3-7-sonnet-20250219-v1:0",
            write: true,
          },
        }),
      });

      // Initialize with empty CLI options
      await configManager.initialize({});

      // Check that values from the file were loaded
      expect(configManager.get("ai.model")).toBe(
        "anthropic.claude-3-7-sonnet-20250219-v1:0",
      );
      expect(configManager.get("ai.write")).toBe(true);
      expect(configManager.getConfigFilePath()).toContain(homeDir);
    });

    it("should load configuration from an explicit path", async () => {
      // Set up mock file system with a config file at a custom path
      const customPath = path.join(currentDir, "custom-config.json");
      mockFs({
        [customPath]: JSON.stringify({
          ai: {
            model: "anthropic.claude-3-opus-20240229-v1:0",
            maxTokens: 16384,
          },
        }),
      });

      // Initialize with explicit config path
      await configManager.initialize({}, customPath);

      // Check that values from the file were loaded
      expect(configManager.get("ai.model")).toBe(
        "anthropic.claude-3-opus-20240229-v1:0",
      );
      expect(configManager.get("ai.maxTokens")).toBe(16384);
      expect(configManager.getConfigFilePath()).toBe(customPath);
    });

    it("should handle file not found", async () => {
      // Set up mock file system with no config files
      mockFs({});

      // Initialize with empty CLI options
      await configManager.initialize({});

      // Check that default values are used
      expect(configManager.get("ai.model")).toBe(
        "anthropic.claude-3-5-sonnet-20241022-v2:0",
      );
      expect(configManager.get("ai.maxTokens")).toBe(4096);
      expect(configManager.getConfigFilePath()).toBeNull();
    });

    it("should handle invalid JSON in config file", async () => {
      // Set up mock file system with an invalid JSON file
      mockFs({
        [path.join(currentDir, ".toolkit-mdrc.json")]: "invalid json",
      });

      // Initialize with empty CLI options
      await configManager.initialize({});

      // Check that default values are used
      expect(configManager.get("ai.model")).toBe(
        "anthropic.claude-3-5-sonnet-20241022-v2:0",
      );
      expect(configManager.get("ai.maxTokens")).toBe(4096);
      expect(configManager.getConfigFilePath()).toBeNull();
    });
  });

  describe("get", () => {
    beforeEach(async () => {
      // Set up mock file system with no config files
      mockFs({});

      // Initialize with empty CLI options
      await configManager.initialize({});
    });

    it("should return CLI option with highest priority", async () => {
      // Set up mock file system with a config file
      mockFs({
        [path.join(currentDir, ".toolkit-mdrc.json")]: JSON.stringify({
          ai: {
            model: "file-value",
          },
        }),
      });

      // Initialize with CLI options
      await configManager.initialize({
        model: "cli-value",
      });

      // Set environment variable
      process.env.TKMD_AI_MODEL = "env-value";

      // Check that CLI value is used
      expect(configManager.get("ai.model")).toBe("cli-value");
    });

    it("should return environment variable with medium priority", async () => {
      // Set up mock file system with a config file
      mockFs({
        [path.join(currentDir, ".toolkit-mdrc.json")]: JSON.stringify({
          ai: {
            model: "file-value",
          },
        }),
      });

      // Initialize with empty CLI options
      await configManager.initialize({});

      // Set environment variable
      process.env.TKMD_AI_MODEL = "env-value";

      // Check that environment value is used
      expect(configManager.get("ai.model")).toBe("env-value");
    });

    it("should return config file value with low priority", async () => {
      // Set up mock file system with a config file
      mockFs({
        [path.join(currentDir, ".toolkit-mdrc.json")]: JSON.stringify({
          ai: {
            model: "file-value",
          },
        }),
      });

      // Initialize with empty CLI options
      await configManager.initialize({});

      // Check that file value is used
      expect(configManager.get("ai.model")).toBe("file-value");
    });

    it("should return default value with lowest priority", async () => {
      // Check that default value is used
      expect(configManager.get("ai.model")).toBe(
        "anthropic.claude-3-5-sonnet-20241022-v2:0",
      );
    });

    it("should handle array values from environment variables", async () => {
      // Set environment variables with prefix
      process.env.TKMD_AI_EXEMPLAR_1 = "value1";
      process.env.TKMD_AI_EXEMPLAR_2 = "value2";

      // Check that array values are collected
      expect(configManager.get("ai.exemplars")).toEqual(["value1", "value2"]);
    });

    it("should validate values", async () => {
      // Set invalid value for contextStrategy
      process.env.TKMD_AI_CONTEXT_STRATEGY = "invalid";

      // Check that validation error is thrown
      expect(() => configManager.get("ai.contextStrategy")).toThrow(
        "Invalid configuration for ai.contextStrategy",
      );
    });

    it("should transform values", async () => {
      // Set string value for maxTokens
      process.env.TKMD_AI_MAX_TOKENS = "42";

      // Check that value is transformed to number
      expect(configManager.get("ai.maxTokens")).toBe(42);
    });
  });
});
