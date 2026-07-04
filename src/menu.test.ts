import { describe, it, expect, vi } from "vitest";
import { selectItem } from "./menu.js";
import { EventEmitter } from "node:events";

function createMockStdin() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    setRawMode: vi.fn().mockReturnThis(),
    resume: vi.fn(),
    pause: vi.fn(),
    isTTY: true,
  });
}

function createMockStdout() {
  return { write: vi.fn() };
}

const ITEMS = ["apple", "banana", "cherry"];

describe("selectItem", () => {
  it("returns the initially selected item on Enter", async () => {
    const stdin = createMockStdin();
    const stdout = createMockStdout();

    const promise = selectItem(ITEMS, {
      label: (x) => x,
      initial: 1,
      stdin: stdin as any,
      stdout: stdout as any,
    });

    // Press Enter
    stdin.emit("data", Buffer.from("\r"));

    const result = await promise;
    expect(result).toBe("banana");
  });

  it("navigates down and selects", async () => {
    const stdin = createMockStdin();
    const stdout = createMockStdout();

    const promise = selectItem(ITEMS, {
      label: (x) => x,
      initial: 0,
      stdin: stdin as any,
      stdout: stdout as any,
    });

    // Down arrow twice, then Enter
    stdin.emit("data", Buffer.from("\x1b[B"));
    stdin.emit("data", Buffer.from("\x1b[B"));
    stdin.emit("data", Buffer.from("\r"));

    const result = await promise;
    expect(result).toBe("cherry");
  });

  it("wraps around when navigating past the end", async () => {
    const stdin = createMockStdin();
    const stdout = createMockStdout();

    const promise = selectItem(ITEMS, {
      label: (x) => x,
      initial: 2,
      stdin: stdin as any,
      stdout: stdout as any,
    });

    // Down arrow wraps to first
    stdin.emit("data", Buffer.from("\x1b[B"));
    stdin.emit("data", Buffer.from("\r"));

    const result = await promise;
    expect(result).toBe("apple");
  });

  it("returns null on Escape", async () => {
    const stdin = createMockStdin();
    const stdout = createMockStdout();

    const promise = selectItem(ITEMS, {
      label: (x) => x,
      stdin: stdin as any,
      stdout: stdout as any,
    });

    stdin.emit("data", Buffer.from("\x1b"));

    const result = await promise;
    expect(result).toBeNull();
  });

  it("returns null on Ctrl+C", async () => {
    const stdin = createMockStdin();
    const stdout = createMockStdout();

    const promise = selectItem(ITEMS, {
      label: (x) => x,
      stdin: stdin as any,
      stdout: stdout as any,
    });

    stdin.emit("data", Buffer.from("\x03"));

    const result = await promise;
    expect(result).toBeNull();
  });

  it("navigates up with wrap", async () => {
    const stdin = createMockStdin();
    const stdout = createMockStdout();

    const promise = selectItem(ITEMS, {
      label: (x) => x,
      initial: 0,
      stdin: stdin as any,
      stdout: stdout as any,
    });

    // Up arrow wraps to last
    stdin.emit("data", Buffer.from("\x1b[A"));
    stdin.emit("data", Buffer.from("\r"));

    const result = await promise;
    expect(result).toBe("cherry");
  });
});
