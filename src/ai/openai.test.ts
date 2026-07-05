import { describe, it, expect } from "vitest";
import { mapFinishReason, mapUsage, toOpenAIMessages, toOpenAITools, fromBlockingCompletion, createStreamResponse } from "./openai.js";
import type { Message, ToolDefinition } from "./types.js";

describe("mapFinishReason", () => {
  it("maps 'stop' to 'stop'", () => {
    expect(mapFinishReason("stop")).toBe("stop");
  });

  it("maps 'length' to 'length'", () => {
    expect(mapFinishReason("length")).toBe("length");
  });

  it("maps 'content_filter' to 'content_filter'", () => {
    expect(mapFinishReason("content_filter")).toBe("content_filter");
  });

  it("maps null to 'unknown'", () => {
    expect(mapFinishReason(null)).toBe("unknown");
  });

  it("maps undefined to 'unknown'", () => {
    expect(mapFinishReason(undefined)).toBe("unknown");
  });

  it("maps unrecognized strings to 'unknown'", () => {
    expect(mapFinishReason("something_else")).toBe("unknown");
  });
});

describe("mapUsage", () => {
  it("returns undefined for undefined input", () => {
    expect(mapUsage(undefined)).toBeUndefined();
  });

  it("maps OpenAI usage to internal format", () => {
    expect(mapUsage({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 })).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });

  it("defaults missing fields to 0", () => {
    expect(mapUsage({})).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });
});

describe("toOpenAIMessages", () => {
  it("prepends system prompt as first message", () => {
    const result = toOpenAIMessages([], "You are helpful");
    expect(result).toEqual([{ role: "system", content: "You are helpful" }]);
  });

  it("maps user text message", () => {
    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = toOpenAIMessages(messages, "sys");
    expect(result[1]).toEqual({ role: "user", content: "hello" });
  });

  it("maps assistant text message", () => {
    const messages: Message[] = [{ role: "assistant", content: "hi" }];
    const result = toOpenAIMessages(messages, "sys");
    expect(result[1]).toEqual({ role: "assistant", content: "hi" });
  });

  it("maps assistant tool call message with type: function", () => {
    const messages: Message[] = [{
      role: "assistant",
      content: null,
      tool_calls: [{ id: "c1", function: { name: "readFile", arguments: '{"path":"a.ts"}' } }],
    }];
    const result = toOpenAIMessages(messages, "sys");
    expect(result[1]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [{ id: "c1", type: "function", function: { name: "readFile", arguments: '{"path":"a.ts"}' } }],
    });
  });

  it("maps tool result message", () => {
    const messages: Message[] = [{ role: "tool", tool_call_id: "c1", content: "file contents" }];
    const result = toOpenAIMessages(messages, "sys");
    expect(result[1]).toEqual({ role: "tool", tool_call_id: "c1", content: "file contents" });
  });

  it("preserves message order", () => {
    const messages: Message[] = [
      { role: "user", content: "read a.ts" },
      { role: "assistant", content: null, tool_calls: [{ id: "c1", function: { name: "readFile", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c1", content: "contents" },
      { role: "assistant", content: "done" },
    ];
    const result = toOpenAIMessages(messages, "sys");
    expect(result).toHaveLength(5);
    expect(result[0].role).toBe("system");
    expect(result[1].role).toBe("user");
    expect(result[2].role).toBe("assistant");
    expect(result[3].role).toBe("tool");
    expect(result[4].role).toBe("assistant");
  });
});

describe("toOpenAITools", () => {
  it("returns undefined for undefined input", () => {
    expect(toOpenAITools(undefined)).toBeUndefined();
  });

  it("returns empty array for empty input", () => {
    expect(toOpenAITools([])).toEqual([]);
  });

  it("maps ToolDefinition to OpenAI ChatCompletionTool format", () => {
    const tools: ToolDefinition[] = [{
      name: "readFile",
      description: "Read a file",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      execute: async () => "",
    }];
    const result = toOpenAITools(tools);
    expect(result).toEqual([{
      type: "function",
      function: {
        name: "readFile",
        description: "Read a file",
        parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      },
    }]);
  });
});

describe("fromBlockingCompletion", () => {
  it("returns ToolCallResponse when tool_calls are present", () => {
    const completion = {
      model: "gpt-4",
      choices: [{
        message: {
          content: null,
          tool_calls: [
            { id: "c1", type: "function" as const, function: { name: "readFile", arguments: '{"path":"a.ts"}' } },
          ],
        },
        finish_reason: "stop" as const,
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };

    const result = fromBlockingCompletion(completion as any);

    expect(result).toEqual({
      stream: false,
      content: null,
      tool_calls: [{ id: "c1", function: { name: "readFile", arguments: '{"path":"a.ts"}' } }],
      meta: {
        model: "gpt-4",
        finishReason: "stop",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      },
    });
  });

  it("filters out non-function tool calls", () => {
    const completion = {
      model: "gpt-4",
      choices: [{
        message: {
          content: null,
          tool_calls: [
            { id: "c1", type: "function" as const, function: { name: "readFile", arguments: "{}" } },
            { id: "c2", type: "other" as const, function: { name: "x", arguments: "{}" } },
          ],
        },
        finish_reason: "stop" as const,
      }],
      usage: undefined,
    };

    const result = fromBlockingCompletion(completion as any);
    expect("tool_calls" in result && result.tool_calls).toHaveLength(1);
  });

  it("returns BlockingResponse when no tool_calls", () => {
    const completion = {
      model: "gpt-4",
      choices: [{
        message: { content: "Hello!", tool_calls: undefined },
        finish_reason: "stop" as const,
      }],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    };

    const result = fromBlockingCompletion(completion as any);

    expect(result).toEqual({
      stream: false,
      content: "Hello!",
      meta: {
        model: "gpt-4",
        finishReason: "stop",
        usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
      },
    });
  });

  it("returns BlockingResponse with empty content when message content is null", () => {
    const completion = {
      model: "gpt-4",
      choices: [{ message: { content: null }, finish_reason: "stop" as const }],
      usage: undefined,
    };

    const result = fromBlockingCompletion(completion as any);
    expect("content" in result && result.content).toBe("");
  });

  it("handles empty choices array", () => {
    const completion = { model: "gpt-4", choices: [], usage: undefined };
    const result = fromBlockingCompletion(completion as any);
    expect("content" in result && result.content).toBe("");
  });
});

describe("createStreamResponse", () => {
  function fakeOaiStream(chunks: Array<{
    model?: string;
    choices: Array<{ finish_reason?: string | null; delta?: { content?: string | null } }>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  }>) {
    return {
      async *[Symbol.asyncIterator]() {
        for (const c of chunks) yield c;
      },
    };
  }

  it("yields content deltas from chunks", async () => {
    const oai = fakeOaiStream([
      { choices: [{ delta: { content: "Hello" } }] },
      { choices: [{ delta: { content: " world" } }] },
    ]);

    const response = createStreamResponse(oai as any, "gpt-4");
    const collected: string[] = [];
    for await (const chunk of response.chunks) {
      collected.push(chunk);
    }
    expect(collected).toEqual(["Hello", " world"]);
  });

  it("skips chunks without delta content", async () => {
    const oai = fakeOaiStream([
      { choices: [{ delta: { content: "Hi" } }] },
      { choices: [{ delta: { content: null } }] },
      { choices: [{ delta: {} }] },
      { choices: [{ delta: { content: "!" } }] },
    ]);

    const response = createStreamResponse(oai as any, "gpt-4");
    const collected: string[] = [];
    for await (const chunk of response.chunks) {
      collected.push(chunk);
    }
    expect(collected).toEqual(["Hi", "!"]);
  });

  it("rejects meta() before stream is exhausted", async () => {
    const oai = fakeOaiStream([{ choices: [{ delta: { content: "x" } }] }]);
    const response = createStreamResponse(oai as any, "gpt-4");

    await expect(response.meta()).rejects.toThrow("Stream not yet exhausted");
  });

  it("resolves meta() after stream is exhausted", async () => {
    const oai = fakeOaiStream([
      { model: "gpt-4-turbo", choices: [{ delta: { content: "x" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
    ]);

    const response = createStreamResponse(oai as any, "gpt-4");
    for await (const _ of response.chunks) { /* exhaust */ }

    const meta = await response.meta();
    expect(meta).toEqual({
      model: "gpt-4-turbo",
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });
  });

  it("uses initial model when chunks don't specify one", async () => {
    const oai = fakeOaiStream([
      { choices: [{ delta: { content: "x" }, finish_reason: "stop" }] },
    ]);

    const response = createStreamResponse(oai as any, "gpt-4");
    for await (const _ of response.chunks) { /* exhaust */ }

    const meta = await response.meta();
    expect(meta.model).toBe("gpt-4");
  });

  it("handles empty stream", async () => {
    const oai = fakeOaiStream([]);
    const response = createStreamResponse(oai as any, "gpt-4");

    const collected: string[] = [];
    for await (const chunk of response.chunks) {
      collected.push(chunk);
    }
    expect(collected).toEqual([]);

    const meta = await response.meta();
    expect(meta.finishReason).toBe("unknown");
  });
});
