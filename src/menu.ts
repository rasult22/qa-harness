export type SelectItemOpts<T> = {
  label: (item: T) => string;
  initial?: number;
  stdin: { on(event: string, cb: (data: Buffer) => void): void; removeListener(event: string, cb: (...args: any[]) => void): void; setRawMode?(mode: boolean): void; resume(): void; pause?(): void };
  stdout: { write(data: string): void };
};

export function selectItem<T>(
  items: T[],
  opts: SelectItemOpts<T>,
): Promise<T | null> {
  const { label, stdin, stdout } = opts;
  let cursor = opts.initial ?? 0;

  function render() {
    // Clear previous menu then draw
    const clearStr = `\x1b[${items.length}A\x1b[J`;
    const lines = items.map((item, i) => {
      const pointer = i === cursor ? "\x1b[32m❯\x1b[0m" : " ";
      const color = i === cursor ? "\x1b[1m\x1b[37m" : "\x1b[90m";
      return `  ${pointer} ${color}${label(item)}\x1b[0m`;
    });
    stdout.write(clearStr + lines.join("\n") + "\n");
  }

  function drawInitial() {
    const lines = items.map((item, i) => {
      const pointer = i === cursor ? "\x1b[32m❯\x1b[0m" : " ";
      const color = i === cursor ? "\x1b[1m\x1b[37m" : "\x1b[90m";
      return `  ${pointer} ${color}${label(item)}\x1b[0m`;
    });
    stdout.write(lines.join("\n") + "\n");
  }

  return new Promise((resolve) => {
    function cleanup(result: T | null) {
      stdin.removeListener("data", onData);
      stdin.setRawMode?.(false);
      // Clear the menu
      stdout.write(`\x1b[${items.length}A\x1b[J`);
      resolve(result);
    }

    function onData(data: Buffer) {
      const s = data.toString();

      if (s === "\x1b" || s === "\x1b\x1b") {
        cleanup(null);
        return;
      }

      if (s === "\x03") {
        cleanup(null);
        return;
      }

      if (s === "\r" || s === "\n") {
        cleanup(items[cursor]);
        return;
      }

      if (s === "\x1b[A") {
        cursor = cursor > 0 ? cursor - 1 : items.length - 1;
        render();
        return;
      }

      if (s === "\x1b[B") {
        cursor = cursor < items.length - 1 ? cursor + 1 : 0;
        render();
        return;
      }
    }

    stdin.setRawMode?.(true);
    stdin.resume();
    drawInitial();
    stdin.on("data", onData);
  });
}
