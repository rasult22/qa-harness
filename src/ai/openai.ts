import OpenAI from "openai";
import type {
  ChatProvider,
  ChatRequest,
  ChatResponse,
  Message,
  ResponseMeta,
  StreamingResponse,
  ToolDefinition,
} from "./types.js";

export function toOpenAITools(tools: ToolDefinition[] | undefined): OpenAI.ChatCompletionTool[] | undefined {
  return tools?.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters as any },
  }));
}

export function toOpenAIMessages(messages: Message[], systemPrompt: string): OpenAI.ChatCompletionMessageParam[] {
  return [
    { role: "system", content: systemPrompt },
    ...messages.map((m): OpenAI.ChatCompletionMessageParam => {
      if ("tool_calls" in m) {
        return { role: "assistant", content: m.content, tool_calls: m.tool_calls.map((tc) => ({ id: tc.id, type: "function" as const, function: tc.function })) };
      }
      if (m.role === "tool") {
        return { role: "tool", tool_call_id: m.tool_call_id, content: m.content };
      }
      return { role: m.role, content: m.content };
    }),
  ];
}

export function fromBlockingCompletion(completion: OpenAI.ChatCompletion): ChatResponse {
  const choice = completion.choices[0];

  if (choice?.message?.tool_calls?.length) {
    return {
      stream: false,
      content: choice.message.content,
      tool_calls: choice.message.tool_calls
        .filter((tc): tc is OpenAI.ChatCompletionMessageToolCall & { type: "function" } => tc.type === "function")
        .map((tc) => ({
          id: tc.id,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      meta: {
        model: completion.model,
        finishReason: mapFinishReason(choice.finish_reason),
        usage: mapUsage(completion.usage),
      },
    };
  }

  return {
    stream: false,
    content: choice?.message?.content ?? "",
    meta: {
      model: completion.model,
      finishReason: mapFinishReason(choice?.finish_reason),
      usage: mapUsage(completion.usage),
    },
  };
}

export function createStreamResponse(
  oaiStream: AsyncIterable<OpenAI.ChatCompletionChunk>,
  initialModel: string,
): StreamingResponse {
  let finishReason: string | null = null;
  let usage: ResponseMeta["usage"] | undefined;
  let actualModel = initialModel;
  let exhausted = false;

  const chunks: AsyncIterable<string> = {
    async *[Symbol.asyncIterator]() {
      for await (const chunk of oaiStream) {
        actualModel = chunk.model ?? actualModel;
        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
        if (chunk.usage) {
          usage = mapUsage(chunk.usage);
        }
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
      exhausted = true;
    },
  };

  return {
    stream: true,
    chunks,
    meta: () => {
      if (!exhausted) {
        return Promise.reject(new Error("Stream not yet exhausted"));
      }
      return Promise.resolve({
        model: actualModel,
        finishReason: mapFinishReason(finishReason),
        usage,
      });
    },
  };
}

export function createOpenAIProvider(opts?: {
  apiKey?: string;
  baseURL?: string;
}): ChatProvider {
  const client = new OpenAI(opts);

  return {
    name: "OpenAI",

    async chat(request: ChatRequest): Promise<ChatResponse> {
      const { messages, systemPrompt, model, tools, stream = true, signal, extra = {} } = request;

      const apiMessages = toOpenAIMessages(messages, systemPrompt);

      const apiTools = toOpenAITools(tools);

      const shared = { model, messages: apiMessages, tools: apiTools, ...extra };

      if (!stream) {
        const completion = await client.chat.completions.create(
          { ...shared, stream: false },
          { signal },
        );
        return fromBlockingCompletion(completion);
      }

      const oaiStream = await client.chat.completions.create(
        { ...shared, stream: true, stream_options: { include_usage: true } },
        { signal },
      );

      return createStreamResponse(oaiStream, model);
    },
  };
}

export function mapFinishReason(raw: string | null | undefined): ResponseMeta["finishReason"] {
  switch (raw) {
    case "stop": return "stop";
    case "length": return "length";
    case "content_filter": return "content_filter";
    default: return "unknown";
  }
}

export function mapUsage(raw: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined): ResponseMeta["usage"] | undefined {
  if (!raw) return undefined;
  return {
    promptTokens: raw.prompt_tokens ?? 0,
    completionTokens: raw.completion_tokens ?? 0,
    totalTokens: raw.total_tokens ?? 0,
  };
}
