import type { ChatResponse, TextMessage } from "./ai/types.js";

export async function consumeStream(
  response: ChatResponse,
  onChunk: (accumulated: string) => void,
): Promise<TextMessage> {
  if (!response.stream) {
    const content = "content" in response ? (response.content ?? "") : "";
    return { role: "assistant", content };
  }

  let full = "";
  for await (const delta of response.chunks) {
    full += delta;
    onChunk(full);
  }
  return { role: "assistant", content: full };
}
