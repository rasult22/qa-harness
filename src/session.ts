import type { ChatProvider, ChatResponse, Message, ToolCallResponse, ToolDefinition } from "./ai/types.js";
import { consumeStream } from "./stream.js";
import { AVAILABLE_MODELS } from "./models.js";

export type SessionState = {
  messages: Message[];
  notifications: string[];
  model: string;
  streaming: string;
  loading: boolean;
};

export type SessionOpts = {
  provider: ChatProvider;
  model?: string;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  cwd?: string;
};

export class Session {
  private state: SessionState;
  private provider: ChatProvider;
  private systemPrompt: string;
  private tools: ToolDefinition[];

  constructor(opts: SessionOpts) {
    this.provider = opts.provider;
    let prompt = opts.systemPrompt ?? "You are a QA assistant. Help users plan, write, and execute tests. Be concise.";
    if (opts.cwd) {
      prompt += `\n\nWorking directory: ${opts.cwd}`;
    }
    this.systemPrompt = prompt;
    this.tools = opts.tools ?? [];
    this.state = {
      messages: [],
      notifications: [],
      model: opts.model ?? "gpt-4.1-nano",
      streaming: "",
      loading: false,
    };
  }

  getState(): SessionState {
    return { ...this.state, messages: [...this.state.messages], notifications: [...this.state.notifications] };
  }

  setModel(model: string): SessionState {
    const models = AVAILABLE_MODELS as readonly string[];
    if (models.includes(model)) {
      this.state.model = model;
      this.state.notifications.push(`Model set to ${model}`);
    } else {
      this.state.notifications.push(`Unknown model "${model}". Available: ${AVAILABLE_MODELS.join(", ")}`);
    }
    return this.getState();
  }

  getMessages(): Message[] {
    return this.state.messages.filter((m) => m.role === "user" || m.role === "assistant");
  }

  async send(text: string, onUpdate?: (state: SessionState) => void): Promise<SessionState> {
    this.state.messages.push({ role: "user", content: text });
    this.state.loading = true;
    this.state.streaming = "";
    onUpdate?.(this.getState());

    try {
      let response = await this.chatRequest(false);

      while (this.isToolCallResponse(response)) {
        const toolCalls = response.tool_calls;
        this.state.messages.push({
          role: "assistant",
          content: response.content,
          tool_calls: toolCalls,
        });

        for (const tc of toolCalls) {
          const result = await this.executeTool(tc.function.name, tc.function.arguments);
          this.state.messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
        }

        onUpdate?.(this.getState());
        response = await this.chatRequest(false);
      }

      const message = await consumeStream(response, (accumulated) => {
        this.state.streaming = accumulated;
        onUpdate?.(this.getState());
      });
      this.state.messages.push(message);
    } catch (err: any) {
      this.state.notifications.push(`Error: ${err.message}`);
    } finally {
      this.state.streaming = "";
      this.state.loading = false;
    }

    return this.getState();
  }

  private async chatRequest(stream: boolean): Promise<ChatResponse> {
    const hasTools = this.tools.length > 0;
    return this.provider.chat({
      model: this.state.model,
      systemPrompt: this.systemPrompt,
      messages: this.getAllMessages(),
      tools: hasTools ? this.tools : undefined,
      stream,
    });
  }

  private isToolCallResponse(response: ChatResponse): response is ToolCallResponse {
    return !response.stream && "tool_calls" in response && Array.isArray(response.tool_calls) && response.tool_calls.length > 0;
  }

  private async executeTool(name: string, argsJson: string): Promise<string> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) return `Error: unknown tool "${name}"`;
    try {
      const args = JSON.parse(argsJson);
      return await tool.execute(args);
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  }

  private getAllMessages(): Message[] {
    return [...this.state.messages];
  }
}
