import type { ChatProvider, ChatRequest, ChatResponse } from "./types.js";
import { createOpenAIProvider } from "./openai.js";

export type { Message, ChatRequest, ChatResponse, ResponseMeta } from "./types.js";

type ProviderName = "openai";

const providers: Record<ProviderName, () => ChatProvider> = {
  openai: () => createOpenAIProvider(),
};

let current: ChatProvider = providers.openai();

export function setProvider(name: ProviderName): void {
  current = providers[name]();
}

export function chat(request: ChatRequest): Promise<ChatResponse> {
  return current.chat(request);
}
