import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createFileTools } from "./tools.js";

describe("file tools", () => {
  let tmpDir: string;
  let tools: ReturnType<typeof createFileTools>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-harness-test-"));
    tools = createFileTools(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function findTool(name: string) {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool;
  }

  describe("readFile", () => {
    it("reads an existing file", async () => {
      fs.writeFileSync(path.join(tmpDir, "hello.txt"), "world");

      const result = await findTool("readFile").execute({ path: "hello.txt" });

      expect(result).toBe("world");
    });

    it("returns an error for missing files", async () => {
      const result = await findTool("readFile").execute({ path: "nope.txt" });

      expect(result).toMatch(/error/i);
    });
  });

  describe("writeFile", () => {
    it("creates a new file", async () => {
      const result = await findTool("writeFile").execute({ path: "new.txt", content: "hello" });

      expect(result).toMatch(/written|created|ok/i);
      expect(fs.readFileSync(path.join(tmpDir, "new.txt"), "utf-8")).toBe("hello");
    });

    it("creates intermediate directories", async () => {
      await findTool("writeFile").execute({ path: "sub/dir/file.txt", content: "deep" });

      expect(fs.readFileSync(path.join(tmpDir, "sub", "dir", "file.txt"), "utf-8")).toBe("deep");
    });
  });

  describe("listDir", () => {
    it("lists files and directories", async () => {
      fs.writeFileSync(path.join(tmpDir, "a.txt"), "");
      fs.mkdirSync(path.join(tmpDir, "subdir"));
      fs.writeFileSync(path.join(tmpDir, "subdir", "b.txt"), "");

      const result = await findTool("listDir").execute({ path: "." });

      expect(result).toContain("a.txt");
      expect(result).toContain("subdir");
    });

    it("returns an error for non-existent directory", async () => {
      const result = await findTool("listDir").execute({ path: "nope" });

      expect(result).toMatch(/error/i);
    });
  });

  describe("fileExists", () => {
    it("returns true for existing file", async () => {
      fs.writeFileSync(path.join(tmpDir, "exists.txt"), "");

      const result = await findTool("fileExists").execute({ path: "exists.txt" });

      expect(result).toBe("true");
    });

    it("returns false for missing file", async () => {
      const result = await findTool("fileExists").execute({ path: "missing.txt" });

      expect(result).toBe("false");
    });
  });

  describe("path safety", () => {
    it("rejects paths that escape the base directory", async () => {
      const result = await findTool("readFile").execute({ path: "../../etc/passwd" });

      expect(result).toMatch(/error|denied|outside/i);
    });
  });
});
