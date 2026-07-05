import { describe, it, expect, vi } from "vitest";
import { Session } from "./session.js";
import type { ChatProvider, ChatResponse, ToolDefinition } from "./ai/types.js";

function stubProvider(response?: ChatResponse): ChatProvider {
  return {
    name: "stub",
    chat: vi.fn().mockResolvedValue(
      response ?? {
        stream: false,
        content: "ok",
        meta: { model: "stub", finishReason: "stop" },
      },
    ),
  };
}

describe("Session", () => {
  describe("setModel", () => {
    it("changes the current model and adds a notification", () => {
      const session = new Session({ provider: stubProvider() });

      const state = session.setModel("gpt-4o");

      expect(state.model).toBe("gpt-4o");
      expect(state.notifications).toContain("Model set to gpt-4o");
    });

    it("rejects unknown models", () => {
      const session = new Session({ provider: stubProvider() });

      const state = session.setModel("nonexistent-model");

      expect(state.model).toBe("gpt-4.1-nano");
      expect(state.notifications[0]).toMatch(/Unknown model/);
    });
  });

  describe("getMessages", () => {
    it("returns only user and assistant messages", async () => {
      const provider = stubProvider();
      const session = new Session({ provider });

      await session.send("hello");
      session.setModel("gpt-4o");

      const msgs = session.getMessages();
      expect(msgs.every((m) => m.role === "user" || m.role === "assistant")).toBe(true);
      expect(msgs).toHaveLength(2); // user + assistant
    });
  });

  describe("send", () => {
    it("adds user message, calls provider, returns final state with assistant reply", async () => {
      const provider = stubProvider({
        stream: false,
        content: "I can help with that",
        meta: { model: "gpt-4.1-nano", finishReason: "stop" },
      });
      const session = new Session({ provider });

      const state = await session.send("write a test");

      expect(state.messages).toHaveLength(2);
      expect(state.messages[0]).toEqual({ role: "user", content: "write a test" });
      expect(state.messages[1]).toEqual({ role: "assistant", content: "I can help with that" });
      expect(state.loading).toBe(false);
      expect(state.streaming).toBe("");
    });

    it("streams chunks and updates state via onUpdate callback", async () => {
      const streamResponse: ChatResponse = {
        stream: true,
        chunks: {
          async *[Symbol.asyncIterator]() {
            yield "Hi";
            yield " there";
          },
        },
        meta: () => Promise.resolve({ model: "gpt-4.1-nano", finishReason: "stop" }),
      };
      const provider = stubProvider(streamResponse);
      const session = new Session({ provider });

      const updates: string[] = [];
      const state = await session.send("hi", (s) => updates.push(s.streaming));

      expect(state.messages[1]).toEqual({ role: "assistant", content: "Hi there" });
      expect(updates).toContain("Hi");
      expect(updates).toContain("Hi there");
    });

    it("handles provider errors gracefully", async () => {
      const provider: ChatProvider = {
        name: "broken",
        chat: vi.fn().mockRejectedValue(new Error("API timeout")),
      };
      const session = new Session({ provider });

      const state = await session.send("test");

      expect(state.notifications).toContain("Error: API timeout");
      expect(state.loading).toBe(false);
    });
  });

  describe("tool calling", () => {
    function makeTool(name: string, impl: (...args: any[]) => Promise<string>): ToolDefinition {
      return {
        name,
        description: `tool ${name}`,
        parameters: { type: "object", properties: {} },
        execute: vi.fn(impl),
      };
    }

    it("executes a tool call and sends the result back to get a final text reply", async () => {
      const readFileTool: ToolDefinition = {
        name: "readFile",
        description: "Read a file",
        parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
        execute: vi.fn().mockResolvedValue("file contents here"),
      };

      const chat = vi.fn()
        .mockResolvedValueOnce({
          stream: false,
          content: null,
          tool_calls: [{ id: "call_1", function: { name: "readFile", arguments: '{"path":"test.txt"}' } }],
          meta: { model: "stub", finishReason: "stop" },
        } satisfies ChatResponse)
        .mockResolvedValueOnce({
          stream: false,
          content: "The file contains: file contents here",
          meta: { model: "stub", finishReason: "stop" },
        } satisfies ChatResponse);

      const provider: ChatProvider = { name: "stub", chat };
      const session = new Session({ provider, tools: [readFileTool] });

      const state = await session.send("read test.txt");

      expect(readFileTool.execute).toHaveBeenCalledWith({ path: "test.txt" });
      expect(chat).toHaveBeenCalledTimes(2);
      expect(state.messages[state.messages.length - 1]).toEqual({
        role: "assistant",
        content: "The file contains: file contents here",
      });
    });
    it("handles multiple tool calls in a single response", async () => {
      const fileExists = makeTool("fileExists", async () => "true");
      const readFile = makeTool("readFile", async () => "content");

      const chat = vi.fn()
        .mockResolvedValueOnce({
          stream: false,
          content: null,
          tool_calls: [
            { id: "c1", function: { name: "fileExists", arguments: '{"path":"a.ts"}' } },
            { id: "c2", function: { name: "readFile", arguments: '{"path":"a.ts"}' } },
          ],
          meta: { model: "stub", finishReason: "stop" },
        } satisfies ChatResponse)
        .mockResolvedValueOnce({
          stream: false,
          content: "done",
          meta: { model: "stub", finishReason: "stop" },
        } satisfies ChatResponse);

      const provider: ChatProvider = { name: "stub", chat };
      const session = new Session({ provider, tools: [fileExists, readFile] });

      const state = await session.send("check a.ts");

      expect(fileExists.execute).toHaveBeenCalled();
      expect(readFile.execute).toHaveBeenCalled();
      expect(state.messages[state.messages.length - 1]).toEqual({ role: "assistant", content: "done" });
    });

    it("sends tool execution errors back to the model instead of crashing", async () => {
      const brokenTool = makeTool("boom", async () => { throw new Error("disk full"); });

      const chat = vi.fn()
        .mockResolvedValueOnce({
          stream: false,
          content: null,
          tool_calls: [{ id: "c1", function: { name: "boom", arguments: "{}" } }],
          meta: { model: "stub", finishReason: "stop" },
        } satisfies ChatResponse)
        .mockResolvedValueOnce({
          stream: false,
          content: "Sorry, there was an error",
          meta: { model: "stub", finishReason: "stop" },
        } satisfies ChatResponse);

      const provider: ChatProvider = { name: "stub", chat };
      const session = new Session({ provider, tools: [brokenTool] });

      const state = await session.send("do something");

      expect(chat).toHaveBeenCalledTimes(2);
      expect(state.messages[state.messages.length - 1]).toEqual({
        role: "assistant",
        content: "Sorry, there was an error",
      });
    });

    it("passes tools to the provider in chat requests", async () => {
      const tool = makeTool("listDir", async () => "a.txt\nb.txt");

      const chat = vi.fn()
        .mockResolvedValueOnce({
          stream: false,
          content: "no tools needed",
          meta: { model: "stub", finishReason: "stop" },
        } satisfies ChatResponse);

      const provider: ChatProvider = { name: "stub", chat };
      const session = new Session({ provider, tools: [tool] });

      await session.send("hello");

      const request = chat.mock.calls[0][0];
      expect(request.tools).toBeDefined();
      expect(request.tools).toHaveLength(1);
      expect(request.tools[0].name).toBe("listDir");
    });

    it("includes cwd in system prompt when provided", async () => {
      const chat = vi.fn().mockResolvedValue({
        stream: false,
        content: "ok",
        meta: { model: "stub", finishReason: "stop" },
      } satisfies ChatResponse);

      const provider: ChatProvider = { name: "stub", chat };
      const session = new Session({ provider, tools: [], cwd: "/home/user/project" });

      await session.send("hi");

      const request = chat.mock.calls[0][0];
      expect(request.systemPrompt).toContain("/home/user/project");
    });

    it("handles call to unknown tool gracefully", async () => {
      const chat = vi.fn()
        .mockResolvedValueOnce({
          stream: false,
          content: null,
          tool_calls: [{ id: "c1", function: { name: "noSuchTool", arguments: "{}" } }],
          meta: { model: "stub", finishReason: "stop" },
        } satisfies ChatResponse)
        .mockResolvedValueOnce({
          stream: false,
          content: "I don't have that tool",
          meta: { model: "stub", finishReason: "stop" },
        } satisfies ChatResponse);

      const provider: ChatProvider = { name: "stub", chat };
      const session = new Session({ provider, tools: [] });

      const state = await session.send("use noSuchTool");

      expect(state.messages[state.messages.length - 1]).toEqual({
        role: "assistant",
        content: "I don't have that tool",
      });
    });
  });
});
