export type Role = "user" | "assistant";

export type Message = {
  role: Role;
  content: string;
};

export type ChatRequest = {
  messages: Message[];
  systemPrompt: string;
  model: string;
  stream?: boolean;
  signal?: AbortSignal;
  extra?: Record<string, unknown>;
};

export type ResponseMeta = {
  model: string;
  finishReason: "stop" | "length" | "content_filter" | "error" | "unknown";
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export type StreamingResponse = {
  stream: true;
  chunks: AsyncIterable<string>;
  meta: () => Promise<ResponseMeta>;
};

export type BlockingResponse = {
  stream: false;
  content: string;
  meta: ResponseMeta;
};

export type ChatResponse = StreamingResponse | BlockingResponse;

export interface ChatProvider {
  readonly name: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
}
