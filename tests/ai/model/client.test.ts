import {
  BedrockRuntimeClient,
  type ContentBlock,
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
  type AgentTool,
  DefaultBedrockClient,
  type Prompt,
  type ToolOutcome,
} from "../../../src/ai/index.js";

const bedrockClientMock = mockClient(BedrockRuntimeClient);

const createDefaultClient = (
  modelId = "anthropic.claude-3-sonnet-20240229-v1:0",
  maxTokens = 1000,
) => {
  return new DefaultBedrockClient(modelId, maxTokens, 0, 0);
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

    it("should extract text when it is not the first content block", async () => {
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "Tell me a joke",
      };

      const responseText = "Why did the chicken cross the road?";
      const mockResponse = {
        output: {
          message: {
            content: [
              {
                reasoningContent: {
                  reasoningText: { text: "", signature: "abc123" },
                },
              },
              { text: responseText },
            ],
            role: "assistant" as ConversationRole,
          },
          $unknown: undefined,
        },
        stopReason: "end_turn" as StopReason,
        usage: { inputTokens: 10, outputTokens: 15, totalTokens: 25 },
        $metadata: { httpStatusCode: 200 },
      };
      bedrockClientMock.on(ConverseCommand).resolves(mockResponse);

      const result = await client.generate(prompt);

      expect(result.output).toBe(responseText);
    });

    it("should return an empty string when no content block has text", async () => {
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "Tell me a joke",
      };

      const mockResponse = {
        output: {
          message: {
            content: [
              {
                reasoningContent: {
                  reasoningText: { text: "", signature: "abc123" },
                },
              },
            ],
            role: "assistant" as ConversationRole,
          },
          $unknown: undefined,
        },
        stopReason: "end_turn" as StopReason,
        usage: { inputTokens: 10, outputTokens: 15, totalTokens: 25 },
        $metadata: { httpStatusCode: 200 },
      };
      bedrockClientMock.on(ConverseCommand).resolves(mockResponse);

      const result = await client.generate(prompt);

      expect(result.output).toBe("");
    });

    it("should strip the inference profile prefix for token counting", async () => {
      const client = createDefaultClient("global.anthropic.claude-sonnet-4-6");
      const prompt: Prompt = {
        prompt: "Tell me a joke",
      };

      bedrockClientMock
        .on(ConverseCommand)
        .resolves(createMockResponse("A joke."));

      await client.generate(prompt);

      const countTokensCalls =
        bedrockClientMock.commandCalls(CountTokensCommand);
      expect(countTokensCalls.length).toBe(1);
      expect(countTokensCalls[0].args[0].input.modelId).toBe(
        "anthropic.claude-sonnet-4-6",
      );

      expectCommandCall(0, "global.anthropic.claude-sonnet-4-6", 1000, [
        {
          role: "user" as ConversationRole,
          content: [{ text: "Tell me a joke" }],
        },
      ]);
    });

    it("should use fallback model for token counting when model does not support it", async () => {
      const client = createDefaultClient("anthropic.claude-sonnet-5");
      const prompt: Prompt = {
        prompt: "Tell me a joke",
      };

      bedrockClientMock
        .on(ConverseCommand)
        .resolves(createMockResponse("A joke."));

      await client.generate(prompt);

      const countTokensCalls =
        bedrockClientMock.commandCalls(CountTokensCommand);
      expect(countTokensCalls.length).toBe(1);
      expect(countTokensCalls[0].args[0].input.modelId).toBe(
        "anthropic.claude-sonnet-4-6",
      );

      expectCommandCall(0, "anthropic.claude-sonnet-5", 1000, [
        {
          role: "user" as ConversationRole,
          content: [{ text: "Tell me a joke" }],
        },
      ]);
    });

    it("should use fallback model for token counting with inference profile prefix", async () => {
      const client = createDefaultClient("global.anthropic.claude-sonnet-5");
      const prompt: Prompt = {
        prompt: "Tell me a joke",
      };

      bedrockClientMock
        .on(ConverseCommand)
        .resolves(createMockResponse("A joke."));

      await client.generate(prompt);

      const countTokensCalls =
        bedrockClientMock.commandCalls(CountTokensCommand);
      expect(countTokensCalls.length).toBe(1);
      expect(countTokensCalls[0].args[0].input.modelId).toBe(
        "anthropic.claude-sonnet-4-6",
      );

      expectCommandCall(0, "global.anthropic.claude-sonnet-5", 1000, [
        {
          role: "user" as ConversationRole,
          content: [{ text: "Tell me a joke" }],
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

    it("should throw error when max_tokens stop reason is reached", async () => {
      const client = createDefaultClient();
      const prompt: Prompt = {
        prompt: "Write a long story",
        context: "You are a storyteller",
      };

      const maxTokensResponse = createMockResponse(
        "Once upon a time, there was a brave knight who",
        "max_tokens",
      );
      bedrockClientMock.on(ConverseCommand).resolves(maxTokensResponse);

      await expect(client.generate(prompt)).rejects.toThrow(
        "Response was truncated because the maximum token limit was reached",
      );

      const commandCalls = bedrockClientMock.commandCalls(ConverseCommand);
      expect(commandCalls.length).toBe(1);
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

      const countTokensCalls =
        bedrockClientMock.commandCalls(CountTokensCommand);
      const countedMessages =
        countTokensCalls[0].args[0].input.input?.converse?.messages ?? [];
      expect(countedMessages[countedMessages.length - 1]).toEqual({
        role: "user" as ConversationRole,
        content: [{ text: "Hello, how can I help you today?" }],
      });
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

  describe("generateWithTools", () => {
    const writeFileSchema = z.object({
      path: z.string(),
      content: z.string(),
    });

    const createToolUseResponse = (
      toolName: string,
      input: unknown,
      toolUseId = "tool-use-1",
      usage = { inputTokens: 10, outputTokens: 15, totalTokens: 25 },
    ) => ({
      output: {
        message: {
          content: [
            { toolUse: { toolUseId, name: toolName, input } },
          ] as ContentBlock[],
          role: "assistant" as ConversationRole,
        },
        $unknown: undefined,
      },
      stopReason: "tool_use" as StopReason,
      usage,
      $metadata: { httpStatusCode: 200 },
    });

    const createCapturingTool = (
      captured: unknown[],
      outcome: ToolOutcome = { kind: "done" },
    ): AgentTool<z.infer<typeof writeFileSchema>> => ({
      name: "write_file",
      description: "Write the complete content of a file",
      inputSchema: writeFileSchema,
      handler: async (input) => {
        captured.push(input);
        return outcome;
      },
    });

    it("should dispatch a forced tool call and terminate on done", async () => {
      const client = createDefaultClient();
      const captured: unknown[] = [];
      const tool = createCapturingTool(captured);

      bedrockClientMock.on(ConverseCommand).resolves(
        createToolUseResponse("write_file", {
          path: "docs/guide.md",
          content: "# Guide",
        }),
      );

      const result = await client.generateWithTools(
        { prompt: "Review this file" },
        [tool as AgentTool],
        { forceTool: "write_file" },
      );

      expect(captured).toEqual([{ path: "docs/guide.md", content: "# Guide" }]);
      expect(result.stopReason).toBe("tool");

      const commandCalls = bedrockClientMock.commandCalls(ConverseCommand);
      expect(commandCalls.length).toBe(1);

      const sentCommand = commandCalls[0].args[0].input;
      expect(sentCommand.toolConfig?.toolChoice).toEqual({
        tool: { name: "write_file" },
      });
      expect(sentCommand.toolConfig?.tools).toEqual([
        {
          toolSpec: {
            name: "write_file",
            description: "Write the complete content of a file",
            inputSchema: {
              json: z.toJSONSchema(writeFileSchema),
            },
          },
        },
      ]);
    });

    it("should feed validation errors back to the model and allow retry", async () => {
      const client = createDefaultClient();
      const captured: unknown[] = [];
      const tool = createCapturingTool(captured);

      bedrockClientMock
        .on(ConverseCommand)
        .resolvesOnce(
          createToolUseResponse("write_file", { path: "docs/guide.md" }),
        )
        .resolvesOnce(
          createToolUseResponse(
            "write_file",
            { path: "docs/guide.md", content: "# Guide" },
            "tool-use-2",
          ),
        );

      const result = await client.generateWithTools(
        { prompt: "Review this file" },
        [tool as AgentTool],
        { forceTool: "write_file" },
      );

      expect(captured).toEqual([{ path: "docs/guide.md", content: "# Guide" }]);
      expect(result.stopReason).toBe("tool");

      const commandCalls = bedrockClientMock.commandCalls(ConverseCommand);
      expect(commandCalls.length).toBe(2);

      const secondCallMessages = commandCalls[1].args[0].input.messages ?? [];
      expect(secondCallMessages.length).toBe(3);

      const toolResultMessage = secondCallMessages[2];
      expect(toolResultMessage.role).toBe("user");
      const toolResultBlock = toolResultMessage.content?.[0].toolResult;
      expect(toolResultBlock?.toolUseId).toBe("tool-use-1");
      expect(toolResultBlock?.status).toBe("error");
      expect(toolResultBlock?.content?.[0].text).toContain(
        "Invalid input for tool write_file",
      );

      const secondToolChoice =
        commandCalls[1].args[0].input.toolConfig?.toolChoice;
      expect(secondToolChoice).toEqual({ auto: {} });
    });

    it("should feed handler error outcomes back to the model", async () => {
      const client = createDefaultClient();
      const captured: unknown[] = [];

      let callCount = 0;
      const tool: AgentTool<z.infer<typeof writeFileSchema>> = {
        name: "write_file",
        description: "Write the complete content of a file",
        inputSchema: writeFileSchema,
        handler: async (input) => {
          captured.push(input);
          callCount++;
          if (callCount === 1) {
            return { kind: "error", message: "Expected path docs/other.md" };
          }
          return { kind: "done" };
        },
      };

      bedrockClientMock
        .on(ConverseCommand)
        .resolvesOnce(
          createToolUseResponse("write_file", {
            path: "docs/wrong.md",
            content: "# Guide",
          }),
        )
        .resolvesOnce(
          createToolUseResponse(
            "write_file",
            { path: "docs/other.md", content: "# Guide" },
            "tool-use-2",
          ),
        );

      const result = await client.generateWithTools(
        { prompt: "Review this file" },
        [tool as AgentTool],
      );

      expect(captured.length).toBe(2);
      expect(result.stopReason).toBe("tool");

      const commandCalls = bedrockClientMock.commandCalls(ConverseCommand);
      const toolResultBlock =
        commandCalls[1].args[0].input.messages?.[2].content?.[0].toolResult;
      expect(toolResultBlock?.status).toBe("error");
      expect(toolResultBlock?.content?.[0].text).toBe(
        "Expected path docs/other.md",
      );
    });

    it("should continue the loop on result outcomes", async () => {
      const client = createDefaultClient();

      const readSchema = z.object({ path: z.string() });
      const readTool: AgentTool<z.infer<typeof readSchema>> = {
        name: "read_file",
        description: "Read a file",
        inputSchema: readSchema,
        handler: async () => ({ kind: "result", content: "# Existing" }),
      };

      const captured: unknown[] = [];
      const writeTool = createCapturingTool(captured);

      bedrockClientMock
        .on(ConverseCommand)
        .resolvesOnce(
          createToolUseResponse("read_file", { path: "docs/guide.md" }),
        )
        .resolvesOnce(
          createToolUseResponse(
            "write_file",
            { path: "docs/guide.md", content: "# Updated" },
            "tool-use-2",
          ),
        );

      const result = await client.generateWithTools(
        { prompt: "Review this file" },
        [readTool as AgentTool, writeTool as AgentTool],
      );

      expect(captured).toEqual([
        { path: "docs/guide.md", content: "# Updated" },
      ]);
      expect(result.stopReason).toBe("tool");

      const commandCalls = bedrockClientMock.commandCalls(ConverseCommand);
      const toolResultBlock =
        commandCalls[1].args[0].input.messages?.[2].content?.[0].toolResult;
      expect(toolResultBlock?.status).toBe("success");
      expect(toolResultBlock?.content?.[0].text).toBe("# Existing");
    });

    it("should terminate with end_turn when the model finishes without a tool call", async () => {
      const client = createDefaultClient();
      const captured: unknown[] = [];
      const tool = createCapturingTool(captured);

      bedrockClientMock
        .on(ConverseCommand)
        .resolves(createMockResponse("No changes needed."));

      const result = await client.generateWithTools(
        { prompt: "Review this file" },
        [tool as AgentTool],
      );

      expect(captured).toEqual([]);
      expect(result.stopReason).toBe("end_turn");
    });

    it("should accumulate usage across turns", async () => {
      const client = createDefaultClient();
      const captured: unknown[] = [];
      const tool = createCapturingTool(captured);

      bedrockClientMock
        .on(ConverseCommand)
        .resolvesOnce(
          createToolUseResponse(
            "write_file",
            { path: "docs/guide.md" },
            "tool-use-1",
            { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          ),
        )
        .resolvesOnce(
          createToolUseResponse(
            "write_file",
            { path: "docs/guide.md", content: "# Guide" },
            "tool-use-2",
            { inputTokens: 40, outputTokens: 5, totalTokens: 45 },
          ),
        );

      const result = await client.generateWithTools(
        { prompt: "Review this file" },
        [tool as AgentTool],
      );

      expect(result.usage.inputTokens).toBe(50);
      expect(result.usage.outputTokens).toBe(25);
      expect(result.usage.totalTokens).toBe(75);
    });

    it("should throw when the turn limit is exhausted", async () => {
      const client = createDefaultClient();

      const tool: AgentTool<z.infer<typeof writeFileSchema>> = {
        name: "write_file",
        description: "Write the complete content of a file",
        inputSchema: writeFileSchema,
        handler: async () => ({ kind: "error", message: "Always fails" }),
      };

      bedrockClientMock.on(ConverseCommand).resolves(
        createToolUseResponse("write_file", {
          path: "docs/guide.md",
          content: "# Guide",
        }),
      );

      await expect(
        client.generateWithTools(
          { prompt: "Review this file" },
          [tool as AgentTool],
          { maxTurns: 3 },
        ),
      ).rejects.toThrow("Tool use loop did not complete within 3 turns");

      expect(bedrockClientMock.commandCalls(ConverseCommand).length).toBe(3);
    });

    it("should include recent tool activity in the turn limit error", async () => {
      const client = createDefaultClient();

      const tool: AgentTool<z.infer<typeof writeFileSchema>> = {
        name: "write_file",
        description: "Write the complete content of a file",
        inputSchema: writeFileSchema,
        handler: async () => ({
          kind: "error",
          message: "oldText not found in the current file content",
        }),
      };

      bedrockClientMock.on(ConverseCommand).resolves(
        createToolUseResponse("write_file", {
          path: "docs/guide.md",
          content: "# Guide",
        }),
      );

      await expect(
        client.generateWithTools(
          { prompt: "Review this file" },
          [tool as AgentTool],
          { maxTurns: 2 },
        ),
      ).rejects.toThrow(
        /Recent activity:[\s\S]*turn 2: write_file -> error: oldText not found/,
      );
    });

    it("should emit debug messages for each tool dispatch", async () => {
      const client = createDefaultClient();
      const captured: unknown[] = [];
      const tool = createCapturingTool(captured);
      const debugMessages: string[] = [];

      bedrockClientMock
        .on(ConverseCommand)
        .resolvesOnce(
          createToolUseResponse("write_file", { path: "docs/guide.md" }),
        )
        .resolvesOnce(
          createToolUseResponse(
            "write_file",
            { path: "docs/guide.md", content: "# Guide" },
            "tool-use-2",
          ),
        );

      await client.generateWithTools(
        { prompt: "Review this file" },
        [tool as AgentTool],
        { onDebug: (message) => debugMessages.push(message) },
      );

      expect(debugMessages.length).toBe(2);
      expect(debugMessages[0]).toContain("Turn 1/10: write_file -> error:");
      expect(debugMessages[1]).toBe("Turn 2/10: write_file -> done");
    });

    it("should throw when the model calls an unknown tool", async () => {
      const client = createDefaultClient();
      const captured: unknown[] = [];
      const tool = createCapturingTool(captured);

      bedrockClientMock
        .on(ConverseCommand)
        .resolves(createToolUseResponse("delete_file", { path: "x" }));

      await expect(
        client.generateWithTools({ prompt: "Review this file" }, [
          tool as AgentTool,
        ]),
      ).rejects.toThrow("Model called unknown tool: delete_file");
    });

    it("should throw when max_tokens stop reason is reached", async () => {
      const client = createDefaultClient();
      const captured: unknown[] = [];
      const tool = createCapturingTool(captured);

      bedrockClientMock
        .on(ConverseCommand)
        .resolves(createMockResponse("Truncated...", "max_tokens"));

      await expect(
        client.generateWithTools({ prompt: "Review this file" }, [
          tool as AgentTool,
        ]),
      ).rejects.toThrow(
        "Response was truncated because the maximum token limit was reached",
      );
    });

    it("should use any tool choice when requireTool is set", async () => {
      const client = createDefaultClient();
      const captured: unknown[] = [];
      const tool = createCapturingTool(captured);

      bedrockClientMock
        .on(ConverseCommand)
        .resolvesOnce(
          createToolUseResponse("write_file", { path: "docs/guide.md" }),
        )
        .resolvesOnce(
          createToolUseResponse(
            "write_file",
            { path: "docs/guide.md", content: "# Guide" },
            "tool-use-2",
          ),
        );

      await client.generateWithTools(
        { prompt: "Review this file" },
        [tool as AgentTool],
        { requireTool: true },
      );

      const commandCalls = bedrockClientMock.commandCalls(ConverseCommand);
      expect(commandCalls[0].args[0].input.toolConfig?.toolChoice).toEqual({
        any: {},
      });
      expect(commandCalls[1].args[0].input.toolConfig?.toolChoice).toEqual({
        any: {},
      });
    });

    it("should prefer forceTool over requireTool on the first turn", async () => {
      const client = createDefaultClient();
      const captured: unknown[] = [];
      const tool = createCapturingTool(captured);

      bedrockClientMock
        .on(ConverseCommand)
        .resolvesOnce(
          createToolUseResponse("write_file", { path: "docs/guide.md" }),
        )
        .resolvesOnce(
          createToolUseResponse(
            "write_file",
            { path: "docs/guide.md", content: "# Guide" },
            "tool-use-2",
          ),
        );

      await client.generateWithTools(
        { prompt: "Review this file" },
        [tool as AgentTool],
        { forceTool: "write_file", requireTool: true },
      );

      const commandCalls = bedrockClientMock.commandCalls(ConverseCommand);
      expect(commandCalls[0].args[0].input.toolConfig?.toolChoice).toEqual({
        tool: { name: "write_file" },
      });
      expect(commandCalls[1].args[0].input.toolConfig?.toolChoice).toEqual({
        any: {},
      });
    });

    it("should include context and cache point in the initial message", async () => {
      const client = createDefaultClient();
      const captured: unknown[] = [];
      const tool = createCapturingTool(captured);

      bedrockClientMock.on(ConverseCommand).resolves(
        createToolUseResponse("write_file", {
          path: "docs/guide.md",
          content: "# Guide",
        }),
      );

      await client.generateWithTools(
        { prompt: "Review this file", context: "You are a reviewer" },
        [tool as AgentTool],
        { cacheEnabled: true },
      );

      const commandCalls = bedrockClientMock.commandCalls(ConverseCommand);
      expect(commandCalls[0].args[0].input.messages).toEqual([
        {
          role: "user" as ConversationRole,
          content: [
            { text: "You are a reviewer" },
            { cachePoint: { type: "default" } },
            { text: "Review this file" },
          ],
        },
      ]);
    });
  });
});
