import { describe, it, expect } from "vitest";
import { assertInProjectRoot } from "./index.js";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";

const root = mkdtempSync(tmpdir() + "/mcp-sec-");

describe("assertInProjectRoot", () => {
  it("returns resolved absolute path for valid relative path", () => {
    const result = assertInProjectRoot("src/index.ts", root);
    expect(result).toBe(root + "/src/index.ts");
  });

  it("throws for path traversal attempt", () => {
    expect(() => assertInProjectRoot("../../etc/passwd", root)).toThrow(
      "access denied: path outside project root"
    );
  });

  it("throws for absolute path outside root", () => {
    expect(() => assertInProjectRoot("/etc/passwd", root)).toThrow(
      "access denied: path outside project root"
    );
  });

  it("throws for absolute path inside root", () => {
    expect(() => assertInProjectRoot(root + "/some/file.ts", root)).toThrow(
      "access denied: path outside project root"
    );
  });

  it("accepts nested paths inside root", () => {
    const result = assertInProjectRoot("a/b/c.ts", root);
    expect(result).toBe(root + "/a/b/c.ts");
  });

  it("accepts the root itself", () => {
    const result = assertInProjectRoot(".", root);
    expect(result).toBe(root);
  });
});
