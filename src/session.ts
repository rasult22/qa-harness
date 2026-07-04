import type { ChatProvider, Message } from "./ai/types.js";
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
};

export class Session {
  private state: SessionState;
  private provider: ChatProvider;
  private systemPrompt: string;

  constructor(opts: SessionOpts) {
    this.provider = opts.provider;
    this.systemPrompt = opts.systemPrompt ?? "You are a QA assistant. Help users plan, write, and execute tests. Be concise.";
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
      const response = await this.provider.chat({
        model: this.state.model,
        systemPrompt: this.systemPrompt,
        messages: this.getMessages(),
      });

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
}
