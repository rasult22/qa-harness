import React from "react";
import { render } from "ink";
import * as readline from "node:readline";
import { createOpenAIProvider } from "./ai/openai.js";
import { Session } from "./session.js";
import { selectItem } from "./menu.js";
import App from "./app.js";
import { AVAILABLE_MODELS } from "./models.js";
import { createFileTools } from "./tools.js";
import type { TextMessage } from "./ai/types.js";

const cwd = process.cwd();

const session = new Session({
  provider: createOpenAIProvider(),
  tools: createFileTools(cwd),
  cwd,
});

function getAppProps() {
  const state = session.getState();
  const messages = state.messages.filter(
    (m): m is TextMessage => m.role === "user" || (m.role === "assistant" && !("tool_calls" in m)),
  );
  return { ...state, messages };
}

const inkInstance = render(
  <App {...getAppProps()} />,
);

function rerender() {
  inkInstance.rerender(<App {...getAppProps()} />);
}

async function enterModelSelect() {
  rl.pause();

  const chosen = await selectItem([...AVAILABLE_MODELS], {
    label: (m) => {
      const current = getAppProps().model;
      return m === current ? `${m} (current)` : m;
    },
    initial: AVAILABLE_MODELS.indexOf(getAppProps().model as typeof AVAILABLE_MODELS[number]),
    stdin: process.stdin,
    stdout: process.stdout,
  });

  if (chosen) {
    session.setModel(chosen);
    rerender();
  }

  rl.resume();
  rl.prompt();
}

async function sendMessage(userText: string) {
  await session.send(userText, () => rerender());
  rerender();
  rl.prompt();
}

function handleSlashCommand(line: string): boolean {
  const parts = line.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(" ").trim();

  if (cmd === "/model") {
    if (!arg) {
      enterModelSelect();
      return true;
    }

    session.setModel(arg);
    rerender();
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
    // Unknown command — just prompt again
    rl.prompt();
    return;
  }

  sendMessage(trimmed);
});

rl.on("close", () => {
  inkInstance.unmount();
  process.exit(0);
});
