import {
  BedrockRuntimeClient,
  type ConversationRole,
  ConverseCommand,
  type Message,
  type StopReason,
  type TokenUsage,
} from "@aws-sdk/client-bedrock-runtime";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultBedrockClient, type Prompt } from "../../../src/ai/index.js";

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

    it("should generate a response with prefill", async () => {
      // Arrange
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "Complete this sentence",
        context: "You are a helpful assistant",
        prefill: "The weather today is",
      };

      const responseText = " sunny and warm.";
      const usage = { inputTokens: 12, outputTokens: 8, totalTokens: 20 };
      const mockResponse = createMockResponse(responseText, "end_turn", usage);
      bedrockClientMock.on(ConverseCommand).resolves(mockResponse);

      // Act
      const result = await client.generate(prompt);

      // Assert
      expect(result.output).toBe("The weather today is sunny and warm.");
      expectUsageStructure(result.usage, usage);

      // Verify the command includes prefill as assistant message
      expect(bedrockClientMock.commandCalls(ConverseCommand).length).toBe(1);
      expectCommandCall(0, "anthropic.claude-3-sonnet-20240229-v1:0", 1000, [
        {
          role: "user" as ConversationRole,
          content: [
            { text: "You are a helpful assistant" },
            { text: "Complete this sentence" },
          ],
        },
        {
          role: "assistant" as ConversationRole,
          content: [{ text: "The weather today is" }],
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
      const result = await client.generate(prompt, true);

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

    it("should handle caching disabled for unsupported models", async () => {
      // Arrange
      const modelId = "unsupported.model-v1:0"; // Caching not supported
      const client = createDefaultClient(modelId);
      const prompt: Prompt = {
        prompt: "Tell me about caching",
        context: "You are a helpful assistant",
      };

      const responseText = "Caching is not supported.";
      const usage = { inputTokens: 10, outputTokens: 8, totalTokens: 18 };
      const mockResponse = createMockResponse(responseText, "end_turn", usage);
      bedrockClientMock.on(ConverseCommand).resolves(mockResponse);

      // Act
      const result = await client.generate(prompt, true);

      // Assert
      expect(result.output).toBe(responseText);
      expectUsageStructure(result.usage, usage);

      // Verify no cache point is included
      expect(bedrockClientMock.commandCalls(ConverseCommand).length).toBe(1);
      expectCommandCall(0, modelId, 1000, [
        {
          role: "user" as ConversationRole,
          content: [
            { text: "You are a helpful assistant" },
            { text: "Tell me about caching" },
          ],
        },
      ]);
    });

    it("should handle max_tokens stop reason and continue generation", async () => {
      // Arrange
      const modelId = "anthropic.claude-3-sonnet-20240229-v1:0";
      const maxTokens = 1000;
      const requestRate = 0;
      const tokenRate = 0;
      const maxIterations = 3;

      const client = new DefaultBedrockClient(
        modelId,
        maxTokens,
        requestRate,
        tokenRate,
        maxIterations,
      );

      const prompt: Prompt = {
        prompt: "Write a long story",
        context: "You are a storyteller",
      };

      // First response hits max_tokens
      const firstResponse = {
        output: {
          message: {
            content: [
              { text: "Once upon a time, there was a brave knight who" },
            ],
            role: "assistant" as ConversationRole,
          },
        },
        stopReason: "max_tokens" as StopReason,
        usage: {
          inputTokens: 10,
          outputTokens: 15,
          totalTokens: 25,
        },
        $metadata: { httpStatusCode: 200 },
      };

      // Second response completes normally
      const secondResponse = {
        output: {
          message: {
            content: [{ text: " saved the kingdom." }],
            role: "assistant" as ConversationRole,
          },
        },
        stopReason: "end_turn" as StopReason,
        usage: {
          inputTokens: 20,
          outputTokens: 8,
          totalTokens: 28,
        },
        $metadata: { httpStatusCode: 200 },
      };

      bedrockClientMock
        .on(ConverseCommand)
        .resolvesOnce(firstResponse)
        .resolvesOnce(secondResponse);

      // Act
      const result = await client.generate(prompt);

      // Assert
      expect(result).toEqual({
        output:
          "Once upon a time, there was a brave knight who saved the kingdom.",
        usage: {
          inputTokens: 30, // Sum of both responses
          outputTokens: 23, // Sum of both responses
          totalTokens: 53, // Sum of both responses
          estimatedTokens: expect.any(Number),
          cacheReadInputTokens: 0,
          cacheWriteInputTokens: 0,
        },
      });

      // Verify two commands were sent
      const commandCalls = bedrockClientMock.commandCalls(ConverseCommand);
      expect(commandCalls.length).toBe(2);

      // First command should be normal
      const firstCommand = commandCalls[0].args[0].input;
      expect(firstCommand.messages).toEqual([
        {
          role: "user" as ConversationRole,
          content: [
            { text: "You are a storyteller" },
            { text: "Write a long story" },
          ],
        },
      ]);

      // Second command should include prefill from first response
      const secondCommand = commandCalls[1].args[0].input;
      expect(secondCommand.messages).toEqual([
        {
          role: "user" as ConversationRole,
          content: [
            { text: "You are a storyteller" },
            { text: "Write a long story" },
          ],
        },
        {
          role: "assistant" as ConversationRole,
          content: [{ text: "Once upon a time, there was a brave knight who" }],
        },
      ]);
    });

    it("should throw error when maximum iterations exceeded", async () => {
      // Arrange
      const maxIterations = 2; // Low limit to trigger error
      const client = createDefaultClient(undefined, 1000, maxIterations);
      const prompt: Prompt = {
        prompt: "Write a very long story",
        context: "You are a storyteller",
      };

      // All responses hit max_tokens
      const maxTokensResponse = createMockResponse(
        "Part of the story...",
        "max_tokens",
      );
      bedrockClientMock.on(ConverseCommand).resolves(maxTokensResponse);

      // Act & Assert
      await expect(client.generate(prompt)).rejects.toThrow(
        "Maximum iterations breached",
      );

      // Verify the expected number of calls were made
      const commandCalls = bedrockClientMock.commandCalls(ConverseCommand);
      expect(commandCalls.length).toBe(maxIterations + 1); // maxIterations + 1 because we check after incrementing
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
  });
});
