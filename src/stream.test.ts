import { describe, it, expect, vi } from "vitest";
import { consumeStream } from "./stream.js";
import type { ChatResponse } from "./ai/types.js";

function makeStreamingResponse(deltas: string[]): ChatResponse {
  return {
    stream: true,
    chunks: {
      async *[Symbol.asyncIterator]() {
        for (const d of deltas) yield d;
      },
    },
    meta: () => Promise.resolve({ model: "test", finishReason: "stop" }),
  };
}

function makeBlockingResponse(content: string): ChatResponse {
  return {
    stream: false,
    content,
    meta: { model: "test", finishReason: "stop" },
  };
}

describe("consumeStream", () => {
  it("accumulates streaming chunks and calls onChunk", async () => {
    const response = makeStreamingResponse(["Hello", " ", "world"]);
    const onChunk = vi.fn();

    const message = await consumeStream(response, onChunk);

    expect(message).toEqual({ role: "assistant", content: "Hello world" });
    expect(onChunk).toHaveBeenCalledTimes(3);
    expect(onChunk).toHaveBeenNthCalledWith(1, "Hello");
    expect(onChunk).toHaveBeenNthCalledWith(2, "Hello ");
    expect(onChunk).toHaveBeenNthCalledWith(3, "Hello world");
  });

  it("handles blocking response without calling onChunk", async () => {
    const response = makeBlockingResponse("Done");
    const onChunk = vi.fn();

    const message = await consumeStream(response, onChunk);

    expect(message).toEqual({ role: "assistant", content: "Done" });
    expect(onChunk).not.toHaveBeenCalled();
  });

  it("handles empty stream", async () => {
    const response = makeStreamingResponse([]);
    const onChunk = vi.fn();

    const message = await consumeStream(response, onChunk);

    expect(message).toEqual({ role: "assistant", content: "" });
    expect(onChunk).not.toHaveBeenCalled();
  });
});
