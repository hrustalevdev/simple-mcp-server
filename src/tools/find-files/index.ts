import { glob } from "glob";
import { join, relative } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { assertInProjectRoot } from "../../security/index.js";
import { logCall, logSuccess, logError } from "../../logger/index.js";

export async function findFiles(
  pattern: string,
  resolvedDir: string,
  projectRoot: string
): Promise<{ files: string[]; count: number }> {
  const matches = await glob(pattern, {
    cwd: resolvedDir,
    nodir: true,
    dot: false,
    ignore: ["**/node_modules/**", "**/dist/**"],
  });
  const files = matches.map((f) => relative(projectRoot, join(resolvedDir, f)));
  return { files, count: files.length };
}

export function registerFindFilesTool(
  server: McpServer,
  projectRoot: string
): void {
  server.registerTool(
    "find_files",
    {
      description: 'Find files by glob pattern within the project. Example pattern: "**/*.ts"',
      inputSchema: z.object({
        pattern: z.string().describe('Glob pattern, e.g. "**/*.ts"'),
        directory: z
          .string()
          .optional()
          .describe("Directory to search in (relative to project root). Defaults to project root."),
      }),
    },
    async ({ pattern, directory }) => {
      const start = Date.now();
      logCall("find_files", { pattern, directory });
      try {
        const resolvedDir = directory
          ? assertInProjectRoot(directory, projectRoot)
          : projectRoot;
        const result = await findFiles(pattern, resolvedDir, projectRoot);
        logSuccess("find_files", Date.now() - start);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logError("find_files", reason);
        throw err;
      }
    }
  );
}
