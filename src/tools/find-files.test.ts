import { describe, it, expect, beforeAll } from "vitest";
import { findFiles } from "./find-files.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let root: string;

beforeAll(() => {
  root = mkdtempSync(tmpdir() + "/mcp-find-");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "index.ts"), "");
  writeFileSync(join(root, "src", "server.ts"), "");
  writeFileSync(join(root, "package.json"), "{}");
});

describe("findFiles", () => {
  it("finds TypeScript files by glob", async () => {
    const result = await findFiles("**/*.ts", root, root);
    expect(result.count).toBe(2);
    expect(result.files).toContain("src/index.ts");
    expect(result.files).toContain("src/server.ts");
  });

  it("finds json files", async () => {
    const result = await findFiles("**/*.json", root, root);
    expect(result.count).toBe(1);
  });

  it("returns empty array for no matches", async () => {
    const result = await findFiles("**/*.py", root, root);
    expect(result.count).toBe(0);
    expect(result.files).toEqual([]);
  });
});
