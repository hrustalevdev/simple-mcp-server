import "dotenv/config";
import { startServer, DEFAULT_ALLOWED_COMMANDS } from "./server.js";

const projectRoot = process.env["PROJECT_ROOT"] ?? process.cwd();
const allowedCommands = process.env["ALLOWED_COMMANDS"]
  ? process.env["ALLOWED_COMMANDS"].split(",").map((c) => c.trim())
  : DEFAULT_ALLOWED_COMMANDS;

startServer(projectRoot, allowedCommands).catch((err) => {
  process.stderr.write(`[FATAL] ${String(err)}\n`);
  process.exit(1);
});
