import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolDefinition } from "./ai/types.js";

export function createFileTools(cwd: string): ToolDefinition[] {
  function safePath(relative: string): string {
    const resolved = path.resolve(cwd, relative);
    if (!resolved.startsWith(path.resolve(cwd))) {
      throw new Error("Path outside working directory is not allowed");
    }
    return resolved;
  }

  return [
    {
      name: "readFile",
      description: "Read the text contents of a single file (not a directory). To see what's inside a directory, use listDir instead.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Relative file path" } },
        required: ["path"],
      },
      async execute(args) {
        try {
          const full = safePath(args.path as string);
          return await fs.readFile(full, "utf-8");
        } catch (err: any) {
          return `Error: ${err.message}`;
        }
      },
    },
    {
      name: "writeFile",
      description: "Write content to a file at the given path (relative to working directory). Creates intermediate directories as needed.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path" },
          content: { type: "string", description: "File content to write" },
        },
        required: ["path", "content"],
      },
      async execute(args) {
        try {
          const full = safePath(args.path as string);
          await fs.mkdir(path.dirname(full), { recursive: true });
          await fs.writeFile(full, args.content as string, "utf-8");
          return "OK — file written";
        } catch (err: any) {
          return `Error: ${err.message}`;
        }
      },
    },
    {
      name: "listDir",
      description: "List the entries (files and subdirectories) inside a directory. Use this to explore project structure before reading specific files.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Relative directory path" } },
        required: ["path"],
      },
      async execute(args) {
        try {
          const full = safePath(args.path as string);
          const entries = await fs.readdir(full, { withFileTypes: true });
          return entries
            .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
            .join("\n");
        } catch (err: any) {
          return `Error: ${err.message}`;
        }
      },
    },
    {
      name: "fileExists",
      description: "Check whether a file or directory exists at the given path (relative to working directory)",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Relative file path" } },
        required: ["path"],
      },
      async execute(args) {
        try {
          const full = safePath(args.path as string);
          await fs.access(full);
          return "true";
        } catch {
          return "false";
        }
      },
    },
  ];
}
