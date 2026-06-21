import { describe, it, expect, beforeAll } from "vitest";
import { listDirectory } from "./index.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let root: string;

beforeAll(() => {
  root = mkdtempSync(tmpdir() + "/mcp-ls-");
  writeFileSync(join(root, "file.ts"), "");
  mkdirSync(join(root, "subdir"));
});

describe("listDirectory", () => {
  it("lists files and directories", async () => {
    const result = await listDirectory(".", root);
    expect(result.entries).toContainEqual(
      expect.objectContaining({ name: "file.ts", type: "file" })
    );
    expect(result.entries).toContainEqual(
      expect.objectContaining({ name: "subdir", type: "dir" })
    );
  });

  it("each entry has name, type and path fields", async () => {
    const result = await listDirectory(".", root);
    expect(result.entries[0]).toHaveProperty("name");
    expect(result.entries[0]).toHaveProperty("type");
    expect(result.entries[0]).toHaveProperty("path");
  });

  it("throws on path traversal", async () => {
    await expect(listDirectory("../../etc", root)).rejects.toThrow("access denied");
  });
});
