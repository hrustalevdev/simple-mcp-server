# AGENTS.md — Project Navigator MCP Server

## What This Project Is

An MCP server that gives AI agents in an IDE the ability to navigate a local codebase. The agent can list directories, read files, search for symbols, and run whitelisted shell commands — without the user manually copying anything into chat.

## Stack

- **Language:** TypeScript (Node.js)
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **Transport:** stdio

## Project Structure

```
src/
  index.ts        ← entry point only (bootstrap)
  server.ts       ← McpServer setup and tool registration
  logger.ts       ← stderr logger (logCall / logSuccess / logError)
  tools/
    list-directory.ts
    read-file.ts
    find-files.ts
    search-code.ts
    run-command.ts
docs/
  hw.md           ← homework assignment
  design.md       ← approved design spec
```

## Build & Run

```bash
npm install
npm run build      # compiles TypeScript to dist/
node dist/index.js # starts the MCP server
```

The server speaks MCP over stdio — it is not a web server. Run it via IDE config, not directly.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PROJECT_ROOT` | `process.cwd()` | Root folder accessible to file tools |
| `ALLOWED_COMMANDS` | `npm run build,npm test,npm run lint,npm run dev,npx tsc --noEmit` | Whitelist for `run_command` |

## Available Tools

| Tool | Description |
|---|---|
| `list_directory` | List files and folders in a directory |
| `read_file` | Read file contents (optionally a line range, 1-indexed) |
| `find_files` | Find files by glob pattern |
| `search_code` | Full-text search across project files |
| `run_command` | Run a whitelisted shell command |

## Key Conventions

- All logs go to **stderr** — stdout is reserved for the MCP protocol
- File tools enforce `PROJECT_ROOT` boundary — path traversal returns an error
- `read_file` refuses `.env*` files by filename
- `run_command` uses `child_process.spawn`, not `exec` — no shell interpolation
- Line numbers in `read_file` are 1-indexed

## Design Reference

Full spec: `docs/design.md`
