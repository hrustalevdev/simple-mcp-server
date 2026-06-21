import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerListDirectoryTool } from "./tools/list-directory/index.js";
import { registerReadFileTool } from "./tools/read-file/index.js";
import { registerFindFilesTool } from "./tools/find-files/index.js";
import { registerSearchCodeTool } from "./tools/search-code/index.js";
import { registerRunCommandTool } from "./tools/run-command/index.js";

export const DEFAULT_ALLOWED_COMMANDS = [
  "npm run build",
  "npm test",
  "npm run lint",
  "npm run dev",
  "npx tsc --noEmit",
];

export async function startServer(
  projectRoot: string,
  allowedCommands: string[]
): Promise<void> {
  const server = new McpServer({ name: "project-navigator", version: "1.0.0" });

  registerListDirectoryTool(server, projectRoot);
  registerReadFileTool(server, projectRoot);
  registerFindFilesTool(server, projectRoot);
  registerSearchCodeTool(server, projectRoot);
  registerRunCommandTool(server, allowedCommands, projectRoot);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[INFO] project-navigator started. PROJECT_ROOT=${projectRoot}\n`
  );
}
