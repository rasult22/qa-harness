import type { ChatResponse } from "./ai/types.js";
import type { Message } from "./ai/types.js";

export async function consumeStream(
  response: ChatResponse,
  onChunk: (accumulated: string) => void,
): Promise<Message> {
  if (!response.stream) {
    return { role: "assistant", content: response.content };
  }

  let full = "";
  for await (const delta of response.chunks) {
    full += delta;
    onChunk(full);
  }
  return { role: "assistant", content: full };
}
