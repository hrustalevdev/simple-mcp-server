import { readFile as fsReadFile } from "fs/promises";
import { basename } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { assertInProjectRoot } from "../../security/index.js";
import { logCall, logSuccess, logError } from "../../logger/index.js";

export async function readFile(
  path: string,
  projectRoot: string,
  startLine?: number,
  endLine?: number
): Promise<{ content: string; total_lines: number; path: string }> {
  if (/^\.env/.test(basename(path))) {
    throw new Error("access denied: .env files are not readable");
  }
  const resolved = assertInProjectRoot(path, projectRoot);
  const raw = await fsReadFile(resolved, "utf-8");
  const lines = raw.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const total_lines = lines.length;
  const start = startLine !== undefined ? startLine - 1 : 0;
  const end = endLine !== undefined ? endLine : total_lines;
  const content = lines.slice(start, end).join("\n");
  return { content, total_lines, path };
}

export function registerReadFileTool(
  server: McpServer,
  projectRoot: string
): void {
  server.registerTool(
    "read_file",
    {
      description: "Read file contents. Line numbers are 1-indexed.",
      inputSchema: z.object({
        path: z.string().describe("File path relative to project root"),
        start_line: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("First line to read (1-indexed)"),
        end_line: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Last line to read, inclusive (1-indexed)"),
      }),
    },
    async ({ path, start_line, end_line }) => {
      const start = Date.now();
      logCall("read_file", { path, start_line, end_line });
      try {
        const result = await readFile(path, projectRoot, start_line, end_line);
        logSuccess("read_file", Date.now() - start);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logError("read_file", reason);
        throw err;
      }
    }
  );
}
