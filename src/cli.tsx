import React from "react";
import { render } from "ink";
import * as readline from "node:readline";
import { chat, type Message } from "./ai/index.js";
import App from "./app.js";
import { AVAILABLE_MODELS } from "./models.js";

const messages: Message[] = [];
let streaming = "";
let loading = false;
let currentModel: string = "gpt-4.1-nano";
let selectingModel = false;
let modelCursor = 0;

const inkInstance = render(
  <App messages={messages} streaming={streaming} loading={loading} />,
);

function rerender() {
  inkInstance.rerender(
    <App messages={[...messages]} streaming={streaming} loading={loading} />,
  );
}

function printModelMenu() {
  console.log(`\n\x1b[1m\x1b[36m  Select model \x1b[0m\x1b[2m(↑↓ Enter, Esc to cancel)\x1b[0m\n`);
  AVAILABLE_MODELS.forEach((m, i) => {
    const pointer = i === modelCursor ? "\x1b[32m❯\x1b[0m" : " ";
    const color = m === currentModel ? "\x1b[33m" : i === modelCursor ? "\x1b[1m\x1b[37m" : "\x1b[90m";
    const suffix = m === currentModel ? " \x1b[2m\x1b[33m(current)\x1b[0m" : "";
    console.log(`  ${pointer} ${color}${m}\x1b[0m${suffix}`);
  });
}

function clearModelMenu() {
  // lines: 1 empty + 1 header + 1 empty + N models = N + 3
  const lines = AVAILABLE_MODELS.length + 3;
  process.stdout.write(`\x1b[${lines}A\x1b[J`);
}

function enterModelSelect() {
  selectingModel = true;
  const idx = (AVAILABLE_MODELS as readonly string[]).indexOf(currentModel);
  modelCursor = idx >= 0 ? idx : 0;
  printModelMenu();

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", onModelKeypress);
}

function exitModelSelect(chosen?: string) {
  process.stdin.removeListener("data", onModelKeypress);
  process.stdin.setRawMode(false);
  selectingModel = false;

  clearModelMenu();

  if (chosen) {
    currentModel = chosen;
    messages.push({ role: "system", content: `Model set to ${chosen}` });
    rerender();
  }

  rl.resume();
  rl.prompt();
}

function onModelKeypress(data: Buffer) {
  const s = data.toString();

  // Escape
  if (s === "\x1b" || s === "\x1b\x1b") {
    exitModelSelect();
    return;
  }

  // Enter
  if (s === "\r" || s === "\n") {
    exitModelSelect(AVAILABLE_MODELS[modelCursor]);
    return;
  }

  // Ctrl+C
  if (s === "\x03") {
    exitModelSelect();
    return;
  }

  // Up arrow
  if (s === "\x1b[A") {
    clearModelMenu();
    modelCursor = modelCursor > 0 ? modelCursor - 1 : AVAILABLE_MODELS.length - 1;
    printModelMenu();
    return;
  }

  // Down arrow
  if (s === "\x1b[B") {
    clearModelMenu();
    modelCursor = modelCursor < AVAILABLE_MODELS.length - 1 ? modelCursor + 1 : 0;
    printModelMenu();
    return;
  }
}

async function sendMessage(userText: string) {
  messages.push({ role: "user", content: userText });
  loading = true;
  streaming = "";
  rerender();

  try {
    const chatMessages = messages.filter((m) => m.role !== "system");
    const response = await chat({
      model: currentModel,
      systemPrompt:
        "You are a QA assistant. Help users plan, write, and execute tests. Be concise.",
      messages: chatMessages,
    });

    if (response.stream) {
      let full = "";
      for await (const delta of response.chunks) {
        full += delta;
        streaming = full;
        rerender();
      }
      messages.push({ role: "assistant", content: full });
    } else {
      messages.push({ role: "assistant", content: response.content });
    }
  } catch (err: any) {
    messages.push({ role: "assistant", content: `Error: ${err.message}` });
  } finally {
    streaming = "";
    loading = false;
    rerender();
    rl.prompt();
  }
}

function handleSlashCommand(line: string): boolean {
  const parts = line.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(" ").trim();

  if (cmd === "/model") {
    if (!arg) {
      rl.pause();
      enterModelSelect();
      return true;
    }

    const models = AVAILABLE_MODELS as readonly string[];
    if (models.includes(arg)) {
      currentModel = arg;
      messages.push({ role: "system", content: `Model set to ${arg}` });
      rerender();
    } else {
      messages.push({ role: "system", content: `Unknown model "${arg}". Available: ${AVAILABLE_MODELS.join(", ")}` });
      rerender();
    }
    rl.prompt();
    return true;
  }

  return false;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "\x1b[36m❯\x1b[0m ",
});

console.log(
  "\x1b[1m\x1b[36m╭─ QA Harness ─────────────────────────╮\x1b[0m",
);
console.log(
  "\x1b[36m│                                       │\x1b[0m",
);
console.log(
  "\x1b[36m│  \x1b[37mAI-powered testing assistant\x1b[36m         │\x1b[0m",
);
console.log(
  "\x1b[36m│  \x1b[2mType a message or Ctrl+C to exit\x1b[0m\x1b[36m  │\x1b[0m",
);
console.log(
  "\x1b[36m│  \x1b[2m/model — switch model\x1b[0m\x1b[36m              │\x1b[0m",
);
console.log(
  "\x1b[36m│                                       │\x1b[0m",
);
console.log(
  "\x1b[1m\x1b[36m╰───────────────────────────────────────╯\x1b[0m\n",
);

rl.prompt();

rl.on("line", (line: string) => {
  const trimmed = line.trim();

  if (!trimmed) {
    rl.prompt();
    return;
  }

  if (trimmed.startsWith("/")) {
    if (handleSlashCommand(trimmed)) return;
    messages.push({ role: "system", content: `Unknown command: ${trimmed}` });
    rerender();
    rl.prompt();
    return;
  }

  sendMessage(trimmed);
});

rl.on("close", () => {
  inkInstance.unmount();
  process.exit(0);
});
