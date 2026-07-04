import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { Message } from "./ai/types.js";
import { renderMarkdown } from "./markdown.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

type AppProps = {
  messages: Message[];
  notifications: string[];
  streaming: string;
  loading: boolean;
};

function Spinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);
  return <Text color="cyan">{SPINNER_FRAMES[frame]}</Text>;
}

export default function App({ messages, notifications, streaming, loading }: AppProps) {
  return (
    <Box flexDirection="column" padding={1}>
      {notifications.map((note, i) => (
        <Box key={`n-${i}`} marginBottom={1} paddingLeft={1}>
          <Text dimColor color="green">
            ✓ {note}
          </Text>
        </Box>
      ))}

      {messages.map((msg, i) => (
        <Box key={`m-${i}`} marginBottom={1} paddingLeft={1}>
          {msg.role === "user" ? (
            <Text>
              <Text bold color="greenBright">
                ❯{" "}
              </Text>
              <Text color="white">{msg.content}</Text>
            </Text>
          ) : (
            <Box flexDirection="column">
              <Text bold color="magentaBright">
                ┃ AI
              </Text>
              <Text>┃ {renderMarkdown(msg.content)}</Text>
            </Box>
          )}
        </Box>
      ))}

      {streaming && (
        <Box marginBottom={1} paddingLeft={1}>
          <Box flexDirection="column">
            <Text bold color="magentaBright">
              ┃ AI
            </Text>
            <Text>
              ┃ {renderMarkdown(streaming)}
              <Text color="magentaBright">▌</Text>
            </Text>
          </Box>
        </Box>
      )}

      {loading && !streaming && (
        <Box paddingLeft={1} gap={1}>
          <Spinner />
          <Text color="yellow">thinking...</Text>
        </Box>
      )}
    </Box>
  );
}
