import { describe, it, expect, vi } from "vitest";
import { logCall, logSuccess, logError } from "./logger.js";

describe("logger", () => {
  it("logCall writes [CALL] line to stderr", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    logCall("list_directory", { path: "src" });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("[CALL]    list_directory")
    );
    spy.mockRestore();
  });

  it("logSuccess writes [SUCCESS] and duration to stderr", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    logSuccess("list_directory", 12);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("[SUCCESS] list_directory")
    );
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("duration=12ms"));
    spy.mockRestore();
  });

  it("logError writes [ERROR] and reason to stderr", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    logError("run_command", "command not in whitelist");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("[ERROR]   run_command")
    );
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("command not in whitelist")
    );
    spy.mockRestore();
  });
});
