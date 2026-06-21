import { describe, it, expect } from "vitest";
import { runCommand } from "./index.js";

const WHITELIST = ["echo hello", "node --version"];

describe("runCommand", () => {
  it("runs an allowed command and captures stdout", async () => {
    const result = await runCommand("echo hello", WHITELIST);
    expect(result.success).toBe(true);
    expect(result.exit_code).toBe(0);
    expect(result.stdout.trim()).toBe("hello");
  });

  it("rejects commands not in whitelist", async () => {
    await expect(runCommand("rm -rf /", WHITELIST)).rejects.toThrow(
      "command not in whitelist"
    );
  });

  it("runs node --version and returns version string", async () => {
    const result = await runCommand("node --version", WHITELIST);
    expect(result.success).toBe(true);
    expect(result.stdout).toMatch(/^v\d+\.\d+\.\d+/);
  });
});
