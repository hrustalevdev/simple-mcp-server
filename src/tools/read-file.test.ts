import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "./read-file.js";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let root: string;

beforeAll(() => {
  root = mkdtempSync(tmpdir() + "/mcp-read-");
  writeFileSync(join(root, "sample.ts"), "line1\nline2\nline3\nline4\nline5");
  writeFileSync(join(root, ".env"), "SECRET=123");
});

describe("readFile", () => {
  it("reads full file content", async () => {
    const result = await readFile("sample.ts", root);
    expect(result.total_lines).toBe(5);
    expect(result.content).toContain("line1");
    expect(result.content).toContain("line5");
    expect(result.path).toBe("sample.ts");
  });

  it("reads a 1-indexed line range", async () => {
    const result = await readFile("sample.ts", root, 2, 3);
    expect(result.content).toBe("line2\nline3");
    expect(result.total_lines).toBe(5);
  });

  it("refuses .env files", async () => {
    await expect(readFile(".env", root)).rejects.toThrow("access denied");
  });

  it("throws on path traversal", async () => {
    await expect(readFile("../../etc/passwd", root)).rejects.toThrow(
      "access denied"
    );
  });
});
