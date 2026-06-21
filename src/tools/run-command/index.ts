import { spawn } from "child_process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logCall, logSuccess, logError } from "../../logger/index.js";

export function runCommand(
  command: string,
  allowedCommands: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; exit_code: number; success: boolean }> {
  if (!allowedCommands.includes(command.trim())) {
    return Promise.reject(new Error("command not in whitelist"));
  }
  const [bin, ...args] = command.trim().split(/\s+/);
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { shell: false, cwd });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("close", (code) => {
      const exit_code = code ?? 1;
      resolve({ stdout, stderr, exit_code, success: exit_code === 0 });
    });
    proc.on("error", reject);
  });
}

export function registerRunCommandTool(
  server: McpServer,
  allowedCommands: string[],
  projectRoot: string
): void {
  server.registerTool(
    "run_command",
    {
      description: `Run a whitelisted shell command. Allowed commands: ${allowedCommands.join(", ")}`,
      inputSchema: z.object({
        command: z
          .string()
          .describe("Exact command string (must match whitelist exactly)"),
      }),
    },
    async ({ command }) => {
      const start = Date.now();
      logCall("run_command", { command });
      try {
        const result = await runCommand(command, allowedCommands, projectRoot);
        logSuccess("run_command", Date.now() - start);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logError("run_command", reason);
        throw err;
      }
    }
  );
}
