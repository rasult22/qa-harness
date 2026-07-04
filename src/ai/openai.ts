import OpenAI from "openai";
import type {
  ChatProvider,
  ChatRequest,
  ChatResponse,
  ResponseMeta,
} from "./types.js";

export function createOpenAIProvider(opts?: {
  apiKey?: string;
  baseURL?: string;
}): ChatProvider {
  const client = new OpenAI(opts);

  return {
    name: "OpenAI",

    async chat(request: ChatRequest): Promise<ChatResponse> {
      const { messages, systemPrompt, model, stream = true, signal, extra = {} } = request;

      const apiMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...messages,
      ];

      const shared = { model, messages: apiMessages, ...extra };

      if (!stream) {
        const completion = await client.chat.completions.create(
          { ...shared, stream: false },
          { signal },
        );

        const choice = completion.choices[0];
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

      const oaiStream = await client.chat.completions.create(
        { ...shared, stream: true, stream_options: { include_usage: true } },
        { signal },
      );

      let finishReason: string | null = null;
      let usage: ResponseMeta["usage"] | undefined;
      let actualModel = model;
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
    },
  };
}

function mapFinishReason(raw: string | null | undefined): ResponseMeta["finishReason"] {
  switch (raw) {
    case "stop": return "stop";
    case "length": return "length";
    case "content_filter": return "content_filter";
    default: return "unknown";
  }
}

function mapUsage(raw: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined): ResponseMeta["usage"] | undefined {
  if (!raw) return undefined;
  return {
    promptTokens: raw.prompt_tokens ?? 0,
    completionTokens: raw.completion_tokens ?? 0,
    totalTokens: raw.total_tokens ?? 0,
  };
}
