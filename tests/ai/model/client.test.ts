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
import { DefaultBedrockClient, type Prompt } from "../../../src/ai/index.js";

const bedrockClientMock = mockClient(BedrockRuntimeClient);

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
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "Tell me a joke",
        context: "You are a helpful assistant",
      };

      const responseText =
        "Why did the chicken cross the road? To get to the other side!";
      const mockResponse = createMockResponse(responseText);
      bedrockClientMock.on(ConverseCommand).resolves(mockResponse);

      const result = await client.generate(prompt);

      expect(result.output).toBe(responseText);
      expectUsageStructure(result.usage, {
        inputTokens: 10,
        outputTokens: 15,
        totalTokens: 25,
      });

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
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "What is 2+2?",
      };

      const responseText = "2+2 equals 4.";
      const usage = { inputTokens: 5, outputTokens: 8, totalTokens: 13 };
      const mockResponse = createMockResponse(responseText, "end_turn", usage);
      bedrockClientMock.on(ConverseCommand).resolves(mockResponse);

      const result = await client.generate(prompt);

      expect(result.output).toBe(responseText);
      expectUsageStructure(result.usage, usage);

      expect(bedrockClientMock.commandCalls(ConverseCommand).length).toBe(1);
      expectCommandCall(0, "anthropic.claude-3-sonnet-20240229-v1:0", 1000, [
        {
          role: "user" as ConversationRole,
          content: [{ text: "What is 2+2?" }],
        },
      ]);
    });

    it("should generate a response with prefill", async () => {
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

      const result = await client.generate(prompt);

      expect(result.output).toBe("The weather today is sunny and warm.");
      expectUsageStructure(result.usage, usage);

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
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "Say hello",
        transform: (input: string) => input.toUpperCase(),
      };

      const responseText = "Hello there!";
      const usage = { inputTokens: 5, outputTokens: 5, totalTokens: 10 };
      const mockResponse = createMockResponse(responseText, "end_turn", usage);
      bedrockClientMock.on(ConverseCommand).resolves(mockResponse);

      const result = await client.generate(prompt);

      expect(result.output).toBe("HELLO THERE!");
      expectUsageStructure(result.usage, usage);
    });

    it("should handle caching enabled for supported models", async () => {
      const modelId = "anthropic.claude-3-5-haiku-20241022-v1:0";
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

      const result = await client.generate(prompt, true);

      expect(result.output).toBe(responseText);
      expectUsageStructure(result.usage, usage);

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

    it("should include cache point for any model when cacheEnabled is true", async () => {
      const modelId = "unsupported.model-v1:0";
      const client = createDefaultClient(modelId);
      const prompt: Prompt = {
        prompt: "Tell me about caching",
        context: "You are a helpful assistant",
      };

      const responseText = "Caching is enabled.";
      const usage = { inputTokens: 10, outputTokens: 8, totalTokens: 18 };
      const mockResponse = createMockResponse(responseText, "end_turn", usage);
      bedrockClientMock.on(ConverseCommand).resolves(mockResponse);

      const result = await client.generate(prompt, true);

      expect(result.output).toBe(responseText);
      expectUsageStructure(result.usage, usage);

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

    it("should handle max_tokens stop reason and continue generation", async () => {
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

      const result = await client.generate(prompt);

      expect(result).toEqual({
        output:
          "Once upon a time, there was a brave knight who saved the kingdom.",
        usage: {
          inputTokens: 30,
          outputTokens: 23,
          totalTokens: 53,
          estimatedTokens: expect.any(Number),
          cacheReadInputTokens: 0,
          cacheWriteInputTokens: 0,
        },
      });

      const commandCalls = bedrockClientMock.commandCalls(ConverseCommand);
      expect(commandCalls.length).toBe(2);

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
      const maxIterations = 2;
      const client = createDefaultClient(undefined, 1000, maxIterations);
      const prompt: Prompt = {
        prompt: "Write a very long story",
        context: "You are a storyteller",
      };

      const maxTokensResponse = createMockResponse(
        "Part of the story...",
        "max_tokens",
      );
      bedrockClientMock.on(ConverseCommand).resolves(maxTokensResponse);

      await expect(client.generate(prompt)).rejects.toThrow(
        "Maximum iterations breached",
      );

      const commandCalls = bedrockClientMock.commandCalls(ConverseCommand);
      expect(commandCalls.length).toBe(maxIterations + 1);
    });

    it("should throw error for unexpected stop reason", async () => {
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "Say hello",
      };

      const mockResponse = createMockResponse("Hello", "content_filtered", {
        inputTokens: 5,
        outputTokens: 3,
        totalTokens: 8,
      });
      bedrockClientMock.on(ConverseCommand).resolves(mockResponse);

      await expect(client.generate(prompt)).rejects.toThrow(
        "Unexpected stop reason: content_filtered",
      );
    });

    it("should handle response without usage information", async () => {
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "Say hello",
      };

      const mockResponse = {
        output: {
          message: {
            content: [{ text: "Hello!" }],
            role: "assistant" as ConversationRole,
          },
          $unknown: undefined,
        },
        stopReason: "end_turn" as StopReason,
        $metadata: { httpStatusCode: 200 },
      };

      bedrockClientMock.on(ConverseCommand).resolves(mockResponse);

      const result = await client.generate(prompt);

      expect(result.output).toBe("Hello!");
      expectUsageStructure(result.usage, {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      });
    });

    it("should handle prompt with sample output", async () => {
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

      const result = await client.generate(prompt);

      expect(result.output).toBe(responseText);
      expectUsageStructure(result.usage, usage);

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
