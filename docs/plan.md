# Project Navigator MCP Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript MCP server exposing 5 tools for codebase navigation (list_directory, read_file, find_files, search_code, run_command) over stdio transport.

**Architecture:** Each tool is a standalone module in `src/tools/` exporting a typed core function and an MCP registration function. `src/server.ts` imports all tools and wires them to an `McpServer`. `src/index.ts` is a thin bootstrap that loads env vars and calls `startServer()`. A shared `src/security.ts` guards all file tools against path traversal.

**Tech Stack:** TypeScript (ESM/NodeNext), `@modelcontextprotocol/sdk`, `zod`, `glob`, `dotenv`, `vitest` (tests)

## Global Constraints

- All file tool paths resolved against `PROJECT_ROOT` env var (default: `process.cwd()`)
- All logs go to `process.stderr` — never `console.log` (breaks stdio protocol)
- `read_file` must refuse filenames matching `/^\.env/`
- `run_command` uses `child_process.spawn` (not `exec`), exact whitelist string match
- Line numbers in `read_file` are 1-indexed
- Tool response format: `{ content: [{ type: "text" as const, text: JSON.stringify(result) }] }`
- No commits — user manages git

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | deps, scripts, `"type": "module"` |
| `tsconfig.json` | NodeNext module resolution for ESM |
| `.env.example` | env var documentation |
| `src/index.ts` | bootstrap: load env → call `startServer()` |
| `src/server.ts` | create `McpServer`, register all 5 tools, connect transport |
| `src/logger.ts` | `logCall` / `logSuccess` / `logError` → stderr |
| `src/security.ts` | `assertInProjectRoot(path, root)` — path traversal guard |
| `src/tools/list-directory.ts` | `listDirectory(path, root)` + `registerListDirectoryTool(server, root)` |
| `src/tools/read-file.ts` | `readFile(path, root, startLine?, endLine?)` + `registerReadFileTool` |
| `src/tools/find-files.ts` | `findFiles(pattern, resolvedDir, root)` + `registerFindFilesTool` |
| `src/tools/search-code.ts` | `searchCode(query, resolvedDir, root, filePattern?)` + `registerSearchCodeTool` |
| `src/tools/run-command.ts` | `runCommand(command, whitelist)` + `registerRunCommandTool` |
| `.claude/settings.json` | MCP server config for Claude Code |

---

### Task 1: Project setup

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `.env.example`

- [ ] **Step 1: Install dependencies**

```bash
npm install @modelcontextprotocol/sdk zod glob dotenv
npm install --save-dev vitest @types/node
```

- [ ] **Step 2: Replace package.json**

```json
{
  "name": "simple-mcp-server",
  "version": "1.0.0",
  "description": "MCP server for codebase navigation",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "dotenv": "^16.0.0",
    "glob": "^11.0.0",
    "zod": "^3.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.5.3",
    "vitest": "^2.0.0"
  },
  "private": true
}
```

- [ ] **Step 3: Replace tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create .env.example**

```env
# Root folder accessible to file navigation tools (default: current working directory)
PROJECT_ROOT=/path/to/your/project

# Comma-separated whitelist of allowed shell commands for run_command tool
ALLOWED_COMMANDS=npm run build,npm test,npm run lint,npm run dev,npx tsc --noEmit
```

- [ ] **Step 5: Verify setup**

```bash
npm install && npm run build
```

Expected: TypeScript compiles without errors (dist/index.js is near-empty at this point).

---

### Task 2: Logger module

**Files:**
- Create: `src/logger.ts`
- Create: `src/logger.test.ts`

**Interfaces:**
- Produces:
  - `logCall(tool: string, params: Record<string, unknown>): void`
  - `logSuccess(tool: string, durationMs: number): void`
  - `logError(tool: string, reason: string): void`

- [ ] **Step 1: Write failing test — create `src/logger.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test
```

Expected: FAIL — "Cannot find module './logger.js'"

- [ ] **Step 3: Implement `src/logger.ts`**

```typescript
function write(line: string): void {
  process.stderr.write(line + "\n");
}

export function logCall(tool: string, params: Record<string, unknown>): void {
  write(`[CALL]    ${tool}  ${JSON.stringify(params)}`);
}

export function logSuccess(tool: string, durationMs: number): void {
  write(`[SUCCESS] ${tool}  duration=${durationMs}ms`);
}

export function logError(tool: string, reason: string): void {
  write(`[ERROR]   ${tool}  reason="${reason}"`);
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test
```

Expected: PASS — 3 tests pass.

---

### Task 3: Security utility

**Files:**
- Create: `src/security.ts`
- Create: `src/security.test.ts`

**Interfaces:**
- Produces: `assertInProjectRoot(userPath: string, projectRoot: string): string`
  — returns resolved absolute path, or throws `Error("access denied: path outside project root")`

- [ ] **Step 1: Write failing test — create `src/security.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { assertInProjectRoot } from "./security.js";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";

const root = mkdtempSync(tmpdir() + "/mcp-sec-");

describe("assertInProjectRoot", () => {
  it("returns resolved absolute path for valid relative path", () => {
    const result = assertInProjectRoot("src/index.ts", root);
    expect(result).toBe(root + "/src/index.ts");
  });

  it("throws for path traversal attempt", () => {
    expect(() => assertInProjectRoot("../../etc/passwd", root)).toThrow(
      "access denied: path outside project root"
    );
  });

  it("throws for absolute path outside root", () => {
    expect(() => assertInProjectRoot("/etc/passwd", root)).toThrow(
      "access denied: path outside project root"
    );
  });

  it("accepts nested paths inside root", () => {
    const result = assertInProjectRoot("a/b/c.ts", root);
    expect(result).toBe(root + "/a/b/c.ts");
  });

  it("accepts the root itself", () => {
    const result = assertInProjectRoot(".", root);
    expect(result).toBe(root);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test
```

Expected: FAIL — "Cannot find module './security.js'"

- [ ] **Step 3: Implement `src/security.ts`**

```typescript
import { resolve } from "path";

export function assertInProjectRoot(
  userPath: string,
  projectRoot: string
): string {
  const resolved = resolve(projectRoot, userPath);
  if (resolved !== projectRoot && !resolved.startsWith(projectRoot + "/")) {
    throw new Error("access denied: path outside project root");
  }
  return resolved;
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test
```

Expected: PASS — 5 tests pass.

---

### Task 4: list_directory tool

**Files:**
- Create: `src/tools/list-directory.ts`
- Create: `src/tools/list-directory.test.ts`

**Interfaces:**
- Consumes: `assertInProjectRoot` from `../security.js`, `logCall`/`logSuccess`/`logError` from `../logger.js`
- Produces:
  - `listDirectory(path: string, projectRoot: string): Promise<{ entries: Array<{ name: string; type: "file" | "dir"; path: string }> }>`
  - `registerListDirectoryTool(server: McpServer, projectRoot: string): void`

- [ ] **Step 1: Write failing test — create `src/tools/list-directory.test.ts`**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { listDirectory } from "./list-directory.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let root: string;

beforeAll(() => {
  root = mkdtempSync(tmpdir() + "/mcp-ls-");
  writeFileSync(join(root, "file.ts"), "");
  mkdirSync(join(root, "subdir"));
});

describe("listDirectory", () => {
  it("lists files and directories", async () => {
    const result = await listDirectory(".", root);
    expect(result.entries).toContainEqual(
      expect.objectContaining({ name: "file.ts", type: "file" })
    );
    expect(result.entries).toContainEqual(
      expect.objectContaining({ name: "subdir", type: "dir" })
    );
  });

  it("each entry has name, type and path fields", async () => {
    const result = await listDirectory(".", root);
    expect(result.entries[0]).toHaveProperty("name");
    expect(result.entries[0]).toHaveProperty("type");
    expect(result.entries[0]).toHaveProperty("path");
  });

  it("throws on path traversal", async () => {
    await expect(listDirectory("../../etc", root)).rejects.toThrow("access denied");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test
```

Expected: FAIL — "Cannot find module './list-directory.js'"

- [ ] **Step 3: Implement `src/tools/list-directory.ts`**

```typescript
import { readdir } from "fs/promises";
import { join, relative } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { assertInProjectRoot } from "../security.js";
import { logCall, logSuccess, logError } from "../logger.js";

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
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test
```

Expected: PASS.

---

### Task 5: read_file tool

**Files:**
- Create: `src/tools/read-file.ts`
- Create: `src/tools/read-file.test.ts`

**Interfaces:**
- Consumes: `assertInProjectRoot` from `../security.js`, logger from `../logger.js`
- Produces:
  - `readFile(path: string, projectRoot: string, startLine?: number, endLine?: number): Promise<{ content: string; total_lines: number; path: string }>`
  - `registerReadFileTool(server: McpServer, projectRoot: string): void`

- [ ] **Step 1: Write failing test — create `src/tools/read-file.test.ts`**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "./read-file.js";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let root: string;

beforeAll(() => {
  root = mkdtempSync(tmpdir() + "/mcp-read-");
  writeFileSync(join(root, "sample.ts"), "line1\nline2\nline3\nline4\nline5");
  writeFileSync(join(root, ".env"), "SECRET=123");
});

describe("readFile", () => {
  it("reads full file content", async () => {
    const result = await readFile("sample.ts", root);
    expect(result.total_lines).toBe(5);
    expect(result.content).toContain("line1");
    expect(result.content).toContain("line5");
    expect(result.path).toBe("sample.ts");
  });

  it("reads a 1-indexed line range", async () => {
    const result = await readFile("sample.ts", root, 2, 3);
    expect(result.content).toBe("line2\nline3");
    expect(result.total_lines).toBe(5);
  });

  it("refuses .env files", async () => {
    await expect(readFile(".env", root)).rejects.toThrow("access denied");
  });

  it("throws on path traversal", async () => {
    await expect(readFile("../../etc/passwd", root)).rejects.toThrow(
      "access denied"
    );
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test
```

Expected: FAIL — "Cannot find module './read-file.js'"

- [ ] **Step 3: Implement `src/tools/read-file.ts`**

```typescript
import { readFile as fsReadFile } from "fs/promises";
import { basename } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { assertInProjectRoot } from "../security.js";
import { logCall, logSuccess, logError } from "../logger.js";

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
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test
```

Expected: PASS.

---

### Task 6: find_files tool

**Files:**
- Create: `src/tools/find-files.ts`
- Create: `src/tools/find-files.test.ts`

**Interfaces:**
- Consumes: `assertInProjectRoot` from `../security.js`, logger from `../logger.js`, `glob` package
- Produces:
  - `findFiles(pattern: string, resolvedDir: string, projectRoot: string): Promise<{ files: string[]; count: number }>`
    — `resolvedDir` is an already-resolved absolute path within projectRoot
  - `registerFindFilesTool(server: McpServer, projectRoot: string): void`

- [ ] **Step 1: Write failing test — create `src/tools/find-files.test.ts`**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { findFiles } from "./find-files.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let root: string;

beforeAll(() => {
  root = mkdtempSync(tmpdir() + "/mcp-find-");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "index.ts"), "");
  writeFileSync(join(root, "src", "server.ts"), "");
  writeFileSync(join(root, "package.json"), "{}");
});

describe("findFiles", () => {
  it("finds TypeScript files by glob", async () => {
    const result = await findFiles("**/*.ts", root, root);
    expect(result.count).toBe(2);
    expect(result.files).toContain("src/index.ts");
    expect(result.files).toContain("src/server.ts");
  });

  it("finds json files", async () => {
    const result = await findFiles("**/*.json", root, root);
    expect(result.count).toBe(1);
  });

  it("returns empty array for no matches", async () => {
    const result = await findFiles("**/*.py", root, root);
    expect(result.count).toBe(0);
    expect(result.files).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test
```

Expected: FAIL — "Cannot find module './find-files.js'"

- [ ] **Step 3: Implement `src/tools/find-files.ts`**

```typescript
import { glob } from "glob";
import { relative } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { assertInProjectRoot } from "../security.js";
import { logCall, logSuccess, logError } from "../logger.js";

export async function findFiles(
  pattern: string,
  resolvedDir: string,
  projectRoot: string
): Promise<{ files: string[]; count: number }> {
  const matches = await glob(pattern, { cwd: resolvedDir, nodir: true, dot: false });
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
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test
```

Expected: PASS.

---

### Task 7: search_code tool

**Files:**
- Create: `src/tools/search-code.ts`
- Create: `src/tools/search-code.test.ts`

**Interfaces:**
- Consumes: `assertInProjectRoot` from `../security.js`, logger from `../logger.js`, `glob`, Node.js `fs`/`readline`
- Produces:
  - `searchCode(query: string, resolvedDir: string, projectRoot: string, filePattern?: string): Promise<{ matches: Array<{ file: string; line: number; content: string }>; count: number }>`
    — `resolvedDir` is an already-resolved absolute path within projectRoot
  - `registerSearchCodeTool(server: McpServer, projectRoot: string): void`

- [ ] **Step 1: Write failing test — create `src/tools/search-code.test.ts`**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { searchCode } from "./search-code.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let root: string;

beforeAll(() => {
  root = mkdtempSync(tmpdir() + "/mcp-search-");
  mkdirSync(join(root, "src"));
  writeFileSync(
    join(root, "src", "server.ts"),
    "const PROJECT_ROOT = process.env.PROJECT_ROOT;\nexport { PROJECT_ROOT };\n"
  );
  writeFileSync(
    join(root, "src", "index.ts"),
    "import { PROJECT_ROOT } from './server.js';\nconsole.error(PROJECT_ROOT);\n"
  );
});

describe("searchCode", () => {
  it("finds matches across files", async () => {
    const result = await searchCode("PROJECT_ROOT", root, root);
    expect(result.count).toBeGreaterThanOrEqual(2);
    expect(result.matches[0]).toMatchObject({
      file: expect.any(String),
      line: expect.any(Number),
      content: expect.stringContaining("PROJECT_ROOT"),
    });
  });

  it("returns empty for no matches", async () => {
    const result = await searchCode("NONEXISTENT_XYZ_999", root, root);
    expect(result.count).toBe(0);
    expect(result.matches).toEqual([]);
  });

  it("filters by file_pattern", async () => {
    const result = await searchCode("PROJECT_ROOT", root, root, "*.ts");
    expect(result.count).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test
```

Expected: FAIL — "Cannot find module './search-code.js'"

- [ ] **Step 3: Implement `src/tools/search-code.ts`**

```typescript
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { join, relative } from "path";
import { glob } from "glob";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { assertInProjectRoot } from "../security.js";
import { logCall, logSuccess, logError } from "../logger.js";

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
  const pattern = filePattern ?? "**/*";
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
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test
```

Expected: PASS.

---

### Task 8: run_command tool

**Files:**
- Create: `src/tools/run-command.ts`
- Create: `src/tools/run-command.test.ts`

**Interfaces:**
- Consumes: logger from `../logger.js`, Node.js `child_process`
- Produces:
  - `runCommand(command: string, allowedCommands: string[]): Promise<{ stdout: string; stderr: string; exit_code: number; success: boolean }>`
  - `registerRunCommandTool(server: McpServer, allowedCommands: string[]): void`

- [ ] **Step 1: Write failing test — create `src/tools/run-command.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { runCommand } from "./run-command.js";

const WHITELIST = ["echo hello", "node --version"];

describe("runCommand", () => {
  it("runs an allowed command and captures stdout", async () => {
    const result = await runCommand("echo hello", WHITELIST);
    expect(result.success).toBe(true);
    expect(result.exit_code).toBe(0);
    expect(result.stdout.trim()).toBe("hello");
  });

  it("rejects commands not in whitelist", async () => {
    await expect(runCommand("rm -rf /", WHITELIST)).rejects.toThrow(
      "command not in whitelist"
    );
  });

  it("runs node --version and returns version string", async () => {
    const result = await runCommand("node --version", WHITELIST);
    expect(result.success).toBe(true);
    expect(result.stdout).toMatch(/^v\d+\.\d+\.\d+/);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test
```

Expected: FAIL — "Cannot find module './run-command.js'"

- [ ] **Step 3: Implement `src/tools/run-command.ts`**

```typescript
import { spawn } from "child_process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logCall, logSuccess, logError } from "../logger.js";

export function runCommand(
  command: string,
  allowedCommands: string[]
): Promise<{ stdout: string; stderr: string; exit_code: number; success: boolean }> {
  if (!allowedCommands.includes(command.trim())) {
    return Promise.reject(new Error("command not in whitelist"));
  }
  const [bin, ...args] = command.trim().split(/\s+/);
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { shell: false });
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
  allowedCommands: string[]
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
        const result = await runCommand(command, allowedCommands);
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
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test
```

Expected: PASS.

---

### Task 9: Server wiring and IDE integration

**Files:**
- Create: `src/server.ts`
- Modify: `src/index.ts`
- Create: `.claude/settings.json`

**Interfaces:**
- Consumes: all `register*Tool` functions from `src/tools/*.ts`
- Produces: running MCP server on stdio, `.claude/settings.json` for Claude Code

- [ ] **Step 1: Implement `src/server.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerListDirectoryTool } from "./tools/list-directory.js";
import { registerReadFileTool } from "./tools/read-file.js";
import { registerFindFilesTool } from "./tools/find-files.js";
import { registerSearchCodeTool } from "./tools/search-code.js";
import { registerRunCommandTool } from "./tools/run-command.js";

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
  registerRunCommandTool(server, allowedCommands);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[INFO] project-navigator started. PROJECT_ROOT=${projectRoot}\n`
  );
}
```

- [ ] **Step 2: Replace `src/index.ts`**

```typescript
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
```

- [ ] **Step 3: Build and smoke-test**

```bash
npm run build
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/index.js
```

Expected: JSON response listing all 5 tools (`list_directory`, `read_file`, `find_files`, `search_code`, `run_command`). Server startup log appears on stderr.

- [ ] **Step 4: Create `.claude/settings.json`**

```json
{
  "mcpServers": {
    "project-navigator": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/simple-mcp-server/dist/index.js"],
      "env": {
        "PROJECT_ROOT": "/ABSOLUTE/PATH/TO/TARGET/PROJECT"
      }
    }
  }
}
```

Replace `ABSOLUTE/PATH/TO/simple-mcp-server` with the real path (e.g. `/Users/yourname/projects/simple-mcp-server`). Replace `TARGET/PROJECT` with the project you want the agent to navigate.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: All tests pass across all modules.
