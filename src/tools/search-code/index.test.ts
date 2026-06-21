import { describe, it, expect, beforeAll } from "vitest";
import { searchCode } from "./index.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let root: string;

beforeAll(() => {
  root = mkdtempSync(tmpdir() + "/mcp-search-");
  mkdirSync(join(root, "src"));
  writeFileSync(
    join(root, "src", "server.ts"),
    "const PROJECT_ROOT = process.env.PROJECT_ROOT;\nexport { PROJECT_ROOT };\n"
  );
  writeFileSync(
    join(root, "src", "index.ts"),
    "import { PROJECT_ROOT } from './server.js';\nconsole.error(PROJECT_ROOT);\n"
  );
});

describe("searchCode", () => {
  it("finds matches across files", async () => {
    const result = await searchCode("PROJECT_ROOT", root, root);
    expect(result.count).toBeGreaterThanOrEqual(2);
    expect(result.matches[0]).toMatchObject({
      file: expect.any(String),
      line: expect.any(Number),
      content: expect.stringContaining("PROJECT_ROOT"),
    });
  });

  it("returns empty for no matches", async () => {
    const result = await searchCode("NONEXISTENT_XYZ_999", root, root);
    expect(result.count).toBe(0);
    expect(result.matches).toEqual([]);
  });

  it("filters by file_pattern", async () => {
    const result = await searchCode("PROJECT_ROOT", root, root, "*.ts");
    expect(result.count).toBeGreaterThanOrEqual(1);
  });
});
