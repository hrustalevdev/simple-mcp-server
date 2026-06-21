import { readdir } from "fs/promises";
import { join, relative } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { assertInProjectRoot } from "../../security/index.js";
import { logCall, logSuccess, logError } from "../../logger/index.js";

type Entry = { name: string; type: "file" | "dir"; path: string };

export async function listDirectory(
  path: string,
  projectRoot: string
): Promise<{ entries: Entry[] }> {
  const resolved = assertInProjectRoot(path, projectRoot);
  const items = await readdir(resolved, { withFileTypes: true });
  const entries: Entry[] = items.map((item) => ({
    name: item.name,
    type: item.isDirectory() ? "dir" : "file",
    path: relative(projectRoot, join(resolved, item.name)),
  }));
  return { entries };
}

export function registerListDirectoryTool(
  server: McpServer,
  projectRoot: string
): void {
  server.registerTool(
    "list_directory",
    {
      description: "List files and folders in a directory within the project",
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .default(".")
          .describe("Directory path relative to project root"),
      }),
    },
    async ({ path }) => {
      const start = Date.now();
      logCall("list_directory", { path });
      try {
        const result = await listDirectory(path, projectRoot);
        logSuccess("list_directory", Date.now() - start);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logError("list_directory", reason);
        throw err;
      }
    }
  );
}
