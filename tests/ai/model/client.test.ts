import {
  BedrockRuntimeClient,
  type ConversationRole,
  ConverseCommand,
  CountTokensCommand,
  type Message,
  type StopReason,
  type TokenUsage,
} from "@aws-sdk/client-bedrock-runtime";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createWriteFileTool,
  DefaultBedrockClient,
  type Prompt,
} from "../../../src/ai/index.js";

// Mock the BedrockRuntimeClient
const bedrockClientMock = mockClient(BedrockRuntimeClient);

// Test utilities
const createDefaultClient = (
  modelId = "anthropic.claude-3-sonnet-20240229-v1:0",
  maxTokens = 1000,
  maxIterations = 3,
) => {
  return new DefaultBedrockClient(modelId, maxTokens, 0, 0, maxIterations);
};

const createMockResponse = (
  text: string,
  stopReason: StopReason = "end_turn",
  usage = { inputTokens: 10, outputTokens: 15, totalTokens: 25 },
) => ({
  output: {
    message: {
      content: [{ text }],
      role: "assistant" as ConversationRole,
    },
    $unknown: undefined,
  },
  stopReason,
  usage,
  $metadata: { httpStatusCode: 200 },
});

const expectUsageStructure = (usage: TokenUsage, expectedUsage: TokenUsage) => {
  expect(usage).toEqual({
    ...expectedUsage,
    estimatedTokens: expect.any(Number),
    cacheReadInputTokens: expectedUsage.cacheReadInputTokens || 0,
    cacheWriteInputTokens: expectedUsage.cacheWriteInputTokens || 0,
  });
};

const expectCommandCall = (
  commandIndex: number,
  expectedModelId: string,
  expectedMaxTokens: number,
  expectedMessages: Message[],
) => {
  const commandCalls = bedrockClientMock.commandCalls(ConverseCommand);
  const sentCommand = commandCalls[commandIndex].args[0].input;
  expect(sentCommand.modelId).toBe(expectedModelId);
  expect(sentCommand.inferenceConfig?.maxTokens).toBe(expectedMaxTokens);
  expect(sentCommand.messages).toEqual(expectedMessages);
};

describe("DefaultBedrockClient", () => {
  beforeEach(() => {
    bedrockClientMock.reset();
    bedrockClientMock.on(CountTokensCommand).resolves({ inputTokens: 0 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("generate", () => {
    it("should generate a response successfully", async () => {
      // Arrange
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "Tell me a joke",
        context: "You are a helpful assistant",
      };

      const responseText =
        "Why did the chicken cross the road? To get to the other side!";
      const mockResponse = createMockResponse(responseText);
      bedrockClientMock.on(ConverseCommand).resolves(mockResponse);

      // Act
      const result = await client.generate(prompt);

      // Assert
      expect(result.output).toBe(responseText);
      expectUsageStructure(result.usage, {
        inputTokens: 10,
        outputTokens: 15,
        totalTokens: 25,
      });

      // Verify the command was sent with the correct parameters
      expect(bedrockClientMock.commandCalls(ConverseCommand).length).toBe(1);
      expectCommandCall(0, "anthropic.claude-3-sonnet-20240229-v1:0", 1000, [
        {
          role: "user" as ConversationRole,
          content: [
            { text: "You are a helpful assistant" },
            { text: "Tell me a joke" },
          ],
        },
      ]);
    });

    it("should generate a response without context", async () => {
      // Arrange
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "What is 2+2?",
      };

      const responseText = "2+2 equals 4.";
      const usage = { inputTokens: 5, outputTokens: 8, totalTokens: 13 };
      const mockResponse = createMockResponse(responseText, "end_turn", usage);
      bedrockClientMock.on(ConverseCommand).resolves(mockResponse);

      // Act
      const result = await client.generate(prompt);

      // Assert
      expect(result.output).toBe(responseText);
      expectUsageStructure(result.usage, usage);

      // Verify the command was sent without context
      expect(bedrockClientMock.commandCalls(ConverseCommand).length).toBe(1);
      expectCommandCall(0, "anthropic.claude-3-sonnet-20240229-v1:0", 1000, [
        {
          role: "user" as ConversationRole,
          content: [{ text: "What is 2+2?" }],
        },
      ]);
    });

    it("should apply transform function to response", async () => {
      // Arrange
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "Say hello",
        transform: (input: string) => input.toUpperCase(),
      };

      const responseText = "Hello there!";
      const usage = { inputTokens: 5, outputTokens: 5, totalTokens: 10 };
      const mockResponse = createMockResponse(responseText, "end_turn", usage);
      bedrockClientMock.on(ConverseCommand).resolves(mockResponse);

      // Act
      const result = await client.generate(prompt);

      // Assert
      expect(result.output).toBe("HELLO THERE!");
      expectUsageStructure(result.usage, usage);
    });

    it("should handle caching enabled for supported models", async () => {
      // Arrange
      const modelId = "anthropic.claude-3-5-haiku-20241022-v1:0"; // Caching supported model
      const client = createDefaultClient(modelId);
      const prompt: Prompt = {
        prompt: "Tell me about caching",
        context: "You are a helpful assistant",
      };

      const responseText = "Caching improves performance.";
      const usage = {
        inputTokens: 10,
        outputTokens: 8,
        totalTokens: 18,
        cacheReadInputTokens: 5,
        cacheWriteInputTokens: 3,
      };
      const mockResponse = createMockResponse(responseText, "end_turn", usage);
      bedrockClientMock.on(ConverseCommand).resolves(mockResponse);

      // Act
      const result = await client.generate(prompt, [], true);

      // Assert
      expect(result.output).toBe(responseText);
      expectUsageStructure(result.usage, usage);

      // Verify cache point is included in the message
      expect(bedrockClientMock.commandCalls(ConverseCommand).length).toBe(1);
      expectCommandCall(0, modelId, 1000, [
        {
          role: "user" as ConversationRole,
          content: [
            { text: "You are a helpful assistant" },
            { cachePoint: { type: "default" } },
            { text: "Tell me about caching" },
          ],
        },
      ]);
    });

    it("should not include cache point when cacheEnabled is false", async () => {
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "Tell me about caching",
        context: "You are a helpful assistant",
      };

      const responseText = "Caching is not enabled.";
      const usage = { inputTokens: 10, outputTokens: 8, totalTokens: 18 };
      const mockResponse = createMockResponse(responseText, "end_turn", usage);
      bedrockClientMock.on(ConverseCommand).resolves(mockResponse);

      const result = await client.generate(prompt);

      expect(result.output).toBe(responseText);
      expectUsageStructure(result.usage, usage);

      expect(bedrockClientMock.commandCalls(ConverseCommand).length).toBe(1);
      expectCommandCall(0, "anthropic.claude-3-sonnet-20240229-v1:0", 1000, [
        {
          role: "user" as ConversationRole,
          content: [
            { text: "You are a helpful assistant" },
            { text: "Tell me about caching" },
          ],
        },
      ]);
    });

    it("should throw error when response exceeds max tokens", async () => {
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "Write a long story",
        context: "You are a storyteller",
      };

      const mockResponse = createMockResponse(
        "Once upon a time...",
        "max_tokens",
      );
      bedrockClientMock.on(ConverseCommand).resolves(mockResponse);

      await expect(client.generate(prompt)).rejects.toThrow(
        "Response exceeded maximum token limit",
      );
    });

    it("should throw error when maximum iterations exceeded", async () => {
      const maxIterations = 2;
      const client = createDefaultClient(undefined, 1000, maxIterations);
      const prompt: Prompt = {
        prompt: "Keep writing files",
      };
      const writeTool = createWriteFileTool();

      const toolUseResponse = {
        output: {
          message: {
            content: [
              {
                toolUse: {
                  toolUseId: "tool-1",
                  name: "write_file",
                  input: { path: "out.md", content: "data", mode: "create" },
                },
              },
            ],
            role: "assistant" as ConversationRole,
          },
        },
        stopReason: "tool_use" as StopReason,
        usage: { inputTokens: 10, outputTokens: 15, totalTokens: 25 },
        $metadata: { httpStatusCode: 200 },
      };

      bedrockClientMock.on(ConverseCommand).resolves(toolUseResponse);

      await expect(client.generate(prompt, [writeTool])).rejects.toThrow(
        "Maximum iterations breached",
      );
    });

    it("should throw error for unexpected stop reason", async () => {
      // Arrange
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "Say hello",
      };

      const mockResponse = createMockResponse(
        "Hello",
        "content_filtered", // Unexpected stop reason
        { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
      );
      bedrockClientMock.on(ConverseCommand).resolves(mockResponse);

      // Act & Assert
      await expect(client.generate(prompt)).rejects.toThrow(
        "Unexpected stop reason: content_filtered",
      );
    });

    it("should handle response without usage information", async () => {
      // Arrange
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "Say hello",
      };

      // Create response without usage information
      const mockResponse = {
        output: {
          message: {
            content: [{ text: "Hello!" }],
            role: "assistant" as ConversationRole,
          },
          $unknown: undefined,
        },
        stopReason: "end_turn" as StopReason,
        // No usage information
        $metadata: { httpStatusCode: 200 },
      };

      bedrockClientMock.on(ConverseCommand).resolves(mockResponse);

      // Act
      const result = await client.generate(prompt);

      // Assert
      expect(result.output).toBe("Hello!");
      expectUsageStructure(result.usage, {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      });
    });

    it("should handle prompt with sample output", async () => {
      // Arrange
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "Generate a greeting",
        context: "You are a friendly assistant",
        sampleOutput: "Hello, how can I help you today?",
      };

      const responseText = "Hi there, what can I do for you?";
      const usage = { inputTokens: 15, outputTokens: 12, totalTokens: 27 };
      const mockResponse = createMockResponse(responseText, "end_turn", usage);
      bedrockClientMock.on(ConverseCommand).resolves(mockResponse);

      // Act
      const result = await client.generate(prompt);

      // Assert
      expect(result.output).toBe(responseText);
      expectUsageStructure(result.usage, usage);

      // The sample output should be used for token estimation but not sent to the model
      expect(bedrockClientMock.commandCalls(ConverseCommand).length).toBe(1);
      expectCommandCall(0, "anthropic.claude-3-sonnet-20240229-v1:0", 1000, [
        {
          role: "user" as ConversationRole,
          content: [
            { text: "You are a friendly assistant" },
            { text: "Generate a greeting" },
          ],
        },
      ]);
    });

    it("should handle tool_use stop reason with write_file create mode", async () => {
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "Write a file for me",
      };
      const writeTool = createWriteFileTool();

      const toolUseResponse = {
        output: {
          message: {
            content: [
              {
                toolUse: {
                  toolUseId: "tool-1",
                  name: "write_file",
                  input: {
                    path: "output.md",
                    content: "# Hello World",
                    mode: "create",
                  },
                },
              },
            ],
            role: "assistant" as ConversationRole,
          },
        },
        stopReason: "tool_use" as StopReason,
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        $metadata: { httpStatusCode: 200 },
      };

      const finalResponse = createMockResponse("Done writing the file.");
      bedrockClientMock
        .on(ConverseCommand)
        .resolvesOnce(toolUseResponse)
        .resolvesOnce(finalResponse);

      const result = await client.generate(prompt, [writeTool]);

      expect(result.output).toBe("Done writing the file.");
      expect(writeTool.files).toEqual(
        new Map([["output.md", "# Hello World"]]),
      );
      expect(bedrockClientMock.commandCalls(ConverseCommand).length).toBe(2);
    });

    it("should handle tool_use stop reason with write_file append mode", async () => {
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "Write a file in parts",
      };
      const writeTool = createWriteFileTool();

      const createResponse = {
        output: {
          message: {
            content: [
              {
                toolUse: {
                  toolUseId: "tool-1",
                  name: "write_file",
                  input: {
                    path: "output.md",
                    content: "# Title\n",
                    mode: "create",
                  },
                },
              },
            ],
            role: "assistant" as ConversationRole,
          },
        },
        stopReason: "tool_use" as StopReason,
        usage: { inputTokens: 10, outputTokens: 15, totalTokens: 25 },
        $metadata: { httpStatusCode: 200 },
      };

      const appendResponse = {
        output: {
          message: {
            content: [
              {
                toolUse: {
                  toolUseId: "tool-2",
                  name: "write_file",
                  input: {
                    path: "output.md",
                    content: "More content",
                    mode: "append",
                  },
                },
              },
            ],
            role: "assistant" as ConversationRole,
          },
        },
        stopReason: "tool_use" as StopReason,
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
        $metadata: { httpStatusCode: 200 },
      };

      const finalResponse = createMockResponse("All done.");
      bedrockClientMock
        .on(ConverseCommand)
        .resolvesOnce(createResponse)
        .resolvesOnce(appendResponse)
        .resolvesOnce(finalResponse);

      const result = await client.generate(prompt, [writeTool]);

      expect(result.output).toBe("All done.");
      expect(writeTool.files).toEqual(
        new Map([["output.md", "# Title\nMore content"]]),
      );
      expect(bedrockClientMock.commandCalls(ConverseCommand).length).toBe(3);
    });

    it("should handle tool_use with multiple files", async () => {
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "Create two files",
      };
      const writeTool = createWriteFileTool();

      const toolUseResponse = {
        output: {
          message: {
            content: [
              {
                toolUse: {
                  toolUseId: "tool-1",
                  name: "write_file",
                  input: {
                    path: "file1.md",
                    content: "File 1",
                    mode: "create",
                  },
                },
              },
              {
                toolUse: {
                  toolUseId: "tool-2",
                  name: "write_file",
                  input: {
                    path: "file2.md",
                    content: "File 2",
                    mode: "create",
                  },
                },
              },
            ],
            role: "assistant" as ConversationRole,
          },
        },
        stopReason: "tool_use" as StopReason,
        usage: { inputTokens: 10, outputTokens: 25, totalTokens: 35 },
        $metadata: { httpStatusCode: 200 },
      };

      const finalResponse = createMockResponse("Created both files.");
      bedrockClientMock
        .on(ConverseCommand)
        .resolvesOnce(toolUseResponse)
        .resolvesOnce(finalResponse);

      const result = await client.generate(prompt, [writeTool]);

      expect(result.output).toBe("Created both files.");
      expect(writeTool.files).toEqual(
        new Map([
          ["file1.md", "File 1"],
          ["file2.md", "File 2"],
        ]),
      );
    });

    it("should pass outputConfig when prompt has outputSchema", async () => {
      const client = createDefaultClient();
      const schema = z.object({
        name: z.string(),
      });
      const prompt: Prompt = {
        prompt: "Extract info",
        outputSchema: {
          schema,
          name: "extraction",
          description: "Extract structured data",
        },
      };

      const responseText = '{"name": "test"}';
      bedrockClientMock
        .on(ConverseCommand)
        .resolves(createMockResponse(responseText));

      const result = await client.generate(prompt);

      expect(result.output).toBe(responseText);

      const commandCalls = bedrockClientMock.commandCalls(ConverseCommand);
      const sentCommand = commandCalls[0].args[0].input;
      expect(sentCommand.outputConfig).toEqual({
        textFormat: {
          type: "json_schema",
          structure: {
            jsonSchema: {
              schema: JSON.stringify(z.toJSONSchema(schema)),
              name: "extraction",
              description: "Extract structured data",
            },
          },
        },
      });
    });

    it("should not include outputConfig when prompt has no outputSchema", async () => {
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "Say hello",
      };

      bedrockClientMock
        .on(ConverseCommand)
        .resolves(createMockResponse("Hello!"));

      await client.generate(prompt);

      const commandCalls = bedrockClientMock.commandCalls(ConverseCommand);
      const sentCommand = commandCalls[0].args[0].input;
      expect(sentCommand.outputConfig).toBeUndefined();
    });
  });
});
