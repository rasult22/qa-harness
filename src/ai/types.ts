export type Role = "user" | "assistant" | "tool";

export type TextMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ToolCall = {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
};

export type AssistantToolCallMessage = {
  role: "assistant";
  content: string | null;
  tool_calls: ToolCall[];
};

export type ToolResultMessage = {
  role: "tool";
  tool_call_id: string;
  content: string;
};

export type Message = TextMessage | AssistantToolCallMessage | ToolResultMessage;

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
};

export type ChatRequest = {
  messages: Message[];
  systemPrompt: string;
  model: string;
  tools?: ToolDefinition[];
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

export type ToolCallResponse = {
  stream: false;
  content: string | null;
  tool_calls: ToolCall[];
  meta: ResponseMeta;
};

export type ChatResponse = StreamingResponse | BlockingResponse | ToolCallResponse;

export interface ChatProvider {
  readonly name: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
}
