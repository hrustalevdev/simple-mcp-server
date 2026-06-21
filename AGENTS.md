# AGENTS.md — Project Navigator MCP Server

## What This Project Is

An MCP server that gives AI agents in an IDE the ability to navigate a local codebase. The agent can list directories, read files, search for symbols, and run whitelisted shell commands — without the user manually copying anything into chat.

## Stack

- **Language:** TypeScript (Node.js)
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **Transport:** stdio

## Project Structure

Each module lives in its own folder with `index.ts` (source) and `index.test.ts` (tests).

```
src/
  index.ts              ← entry point only (bootstrap)
  server.ts             ← McpServer setup and tool registration
  logger/
    index.ts            ← stderr logger (logCall / logSuccess / logError)
    index.test.ts
  security/
    index.ts            ← assertInProjectRoot — path traversal guard
    index.test.ts
  tools/
    list-directory/
      index.ts
      index.test.ts
    read-file/
      index.ts
      index.test.ts
    find-files/
      index.ts
      index.test.ts
    search-code/
      index.ts
      index.test.ts
    run-command/
      index.ts
      index.test.ts
docs/
  hw.md           ← homework assignment
  design.md       ← approved design spec
  plan.md         ← implementation plan
```

**Import paths:** NodeNext module resolution requires explicit `index.js` in imports — e.g. `import { logCall } from "../logger/index.js"` (not `"../logger.js"`).

## Build & Run

**Docker (recommended — no Node.js required):**
```bash
docker build -t project-navigator-mcp .
# smoke test:
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | docker run --rm -i project-navigator-mcp
```

**Node.js directly:**
```bash
npm install
npm run build
node dist/index.js
```

The server speaks MCP over stdio — it is not a web server. Run it via IDE config, not directly.

## Docker & IDE integration

`.claude/settings.json` for Docker:
```json
{
  "mcpServers": {
    "project-navigator": {
      "command": "docker",
      "args": ["run", "--rm", "-i",
               "-v", "/path/to/project:/project:ro",
               "-e", "PROJECT_ROOT=/project",
               "project-navigator-mcp"]
    }
  }
}
```

Example: `.claude/settings.json.docker-example`

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
