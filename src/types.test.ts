import { describe, it, expect, vi } from "vitest";
import { Session } from "./session.js";
import type { ChatProvider } from "./ai/types.js";

function stubProvider(): ChatProvider {
  return {
    name: "stub",
    chat: vi.fn().mockResolvedValue({
      stream: false,
      content: "reply",
      meta: { model: "stub", finishReason: "stop" },
    }),
  };
}

describe("Message type separation", () => {
  it("notifications are separate from messages — no system role in messages array", async () => {
    const session = new Session({ provider: stubProvider() });

    session.setModel("gpt-4o");
    session.setModel("nonexistent");
    await session.send("hello");

    const state = session.getState();

    // Messages only contain user/assistant
    for (const msg of state.messages) {
      expect(["user", "assistant"]).toContain(msg.role);
    }

    // Notifications contain the status strings
    expect(state.notifications).toHaveLength(2);
    expect(state.notifications[0]).toBe("Model set to gpt-4o");
    expect(state.notifications[1]).toMatch(/Unknown model/);
  });

  it("provider errors go to notifications, not messages", async () => {
    const provider: ChatProvider = {
      name: "broken",
      chat: vi.fn().mockRejectedValue(new Error("fail")),
    };
    const session = new Session({ provider });

    await session.send("test");

    const state = session.getState();

    // User message exists, but no error in messages
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe("user");

    // Error in notifications
    expect(state.notifications).toContain("Error: fail");
  });

  it("getMessages filters to only what the AI provider should see", async () => {
    const session = new Session({ provider: stubProvider() });

    session.setModel("gpt-4o");
    await session.send("hi");
    session.setModel("gpt-4.1-mini");

    const aiMessages = session.getMessages();

    expect(aiMessages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "reply" },
    ]);
  });
});
