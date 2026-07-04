import { describe, it, expect, vi } from "vitest";
import { Session } from "./session.js";
import type { ChatProvider, ChatResponse } from "./ai/types.js";

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
});
