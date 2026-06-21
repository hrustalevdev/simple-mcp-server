import { createReadStream } from "fs";
import { createInterface } from "readline";
import { join, relative } from "path";
import { glob } from "glob";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { assertInProjectRoot } from "../../security/index.js";
import { logCall, logSuccess, logError } from "../../logger/index.js";

type Match = { file: string; line: number; content: string };

async function searchInFile(
  filePath: string,
  query: string,
  projectRoot: string
): Promise<Match[]> {
  const matches: Match[] = [];
  const rl = createInterface({
    input: createReadStream(filePath, "utf-8"),
    crlfDelay: Infinity,
  });
  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    if (line.includes(query)) {
      matches.push({ file: relative(projectRoot, filePath), line: lineNum, content: line.trim() });
    }
  }
  return matches;
}

export async function searchCode(
  query: string,
  resolvedDir: string,
  projectRoot: string,
  filePattern?: string
): Promise<{ matches: Match[]; count: number }> {
  // If pattern has no path separator or glob recursion, make it recursive
  const raw = filePattern ?? "**/*";
  const pattern = raw.includes("/") || raw.startsWith("**") ? raw : `**/${raw}`;
  const files = await glob(pattern, { cwd: resolvedDir, nodir: true, dot: false });
  const allMatches: Match[] = [];
  for (const file of files) {
    try {
      const matches = await searchInFile(join(resolvedDir, file), query, projectRoot);
      allMatches.push(...matches);
    } catch {
      // skip unreadable / binary files
    }
  }
  return { matches: allMatches, count: allMatches.length };
}

export function registerSearchCodeTool(
  server: McpServer,
  projectRoot: string
): void {
  server.registerTool(
    "search_code",
    {
      description: "Full-text search across project files",
      inputSchema: z.object({
        query: z.string().describe("Text string to search for"),
        directory: z
          .string()
          .optional()
          .describe("Directory to search in (relative to project root). Defaults to project root."),
        file_pattern: z
          .string()
          .optional()
          .describe('Glob to filter which files are searched, e.g. "*.ts"'),
      }),
    },
    async ({ query, directory, file_pattern }) => {
      const start = Date.now();
      logCall("search_code", { query, directory, file_pattern });
      try {
        const resolvedDir = directory
          ? assertInProjectRoot(directory, projectRoot)
          : projectRoot;
        const result = await searchCode(query, resolvedDir, projectRoot, file_pattern);
        logSuccess("search_code", Date.now() - start);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logError("search_code", reason);
        throw err;
      }
    }
  );
}
