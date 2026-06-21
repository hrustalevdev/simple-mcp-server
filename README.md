# Project Navigator MCP Server

MCP-сервер для навигации по кодовой базе. Позволяет AI-агенту в IDE самостоятельно исследовать проект: просматривать файлы, искать символы и запускать безопасные команды — без ручного копирования кода в чат.

## Как работает MCP

IDE запускает MCP-сервер как дочерний процесс и общается с ним через stdin/stdout. Агент вызывает инструменты (tools) — типизированные функции с описанием и схемой параметров. Это позволяет агенту автономно получать контекст из внешних источников (файловая система, команды) вместо того, чтобы ждать, пока пользователь всё скопирует вручную.

В этом сервере **tool** — это изолированная функция с именем, описанием, JSON-схемой входных параметров и структурированным JSON-ответом.

## Инструменты

| Инструмент | Описание |
|---|---|
| `list_directory` | Список файлов и папок в директории |
| `read_file` | Чтение содержимого файла (опционально — диапазон строк) |
| `find_files` | Поиск файлов по glob-паттерну (`**/*.ts`) |
| `search_code` | Полнотекстовый поиск по файлам проекта |
| `run_command` | Запуск команды из whitelist |

### Tool outputs contract

Все инструменты возвращают структурированный JSON:

```typescript
// list_directory
{ entries: Array<{ name: string; type: "file" | "dir"; path: string }> }

// read_file
{ content: string; total_lines: number; path: string }

// find_files
{ files: string[]; count: number }

// search_code
{ matches: Array<{ file: string; line: number; content: string }>; count: number }

// run_command
{ stdout: string; stderr: string; exit_code: number; success: boolean }
```

Ошибки возвращаются через стандартный MCP error response.

## Структура проекта

```
src/
  index.ts              ← bootstrap (env → startServer)
  server.ts             ← McpServer, регистрация инструментов
  logger/
    index.ts            ← logCall / logSuccess / logError → stderr
    index.test.ts
  security/
    index.ts            ← assertInProjectRoot (path traversal guard)
    index.test.ts
  tools/
    list-directory/index.ts + index.test.ts
    read-file/index.ts + index.test.ts
    find-files/index.ts + index.test.ts
    search-code/index.ts + index.test.ts
    run-command/index.ts + index.test.ts
```

## Запуск через Docker (рекомендуется)

Node.js на машине не нужен.

```bash
docker build -t project-navigator-mcp .
```

Проверка (smoke test):
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | docker run --rm -i project-navigator-mcp
```

Ожидаемый результат — JSON с 5 инструментами: `list_directory`, `read_file`, `find_files`, `search_code`, `run_command`.

> **Ограничение `run_command` в Docker:** инструмент запускает команды в директории `PROJECT_ROOT`. Если `node_modules` целевого проекта установлен на другой ОС (например, macOS), нативные биндинги (`rolldown`, `esbuild` и т.п.) не будут работать внутри Linux-контейнера. В этом случае `npm test` упадёт с ошибкой о нативном модуле — это ограничение окружения, не сервера. Для запуска тестов используйте Node.js-вариант (без Docker) или предварительно выполните `npm install` в целевом проекте внутри контейнера.

## Интеграция с агентами и IDE

MCP — открытый протокол. Сервер работает с любым MCP-совместимым клиентом; меняется только путь к конфиг-файлу и название ключа.

Во всех примерах замените `/ABSOLUTE/PATH/TO/PROJECT` на абсолютный путь к проекту, который хотите исследовать.

> **Без Docker:** замените блок `"command": "docker", "args": ["run", ...]` на `"command": "node", "args": ["/path/to/simple-mcp-server/dist/index.js"]` и добавьте `"env": { "PROJECT_ROOT": "/path/to/project" }`.

---

### Claude Code

Добавьте один раз в глобальный `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "project-navigator": {
      "command": "sh",
      "args": ["-c", "docker run --rm -i -v \"$(pwd):/project:ro\" -e PROJECT_ROOT=/project project-navigator-mcp"]
    }
  }
}
```

`$(pwd)` автоматически подставляет директорию, из которой запущен Claude Code — **путь к проекту указывать не нужно**. Просто откройте любой проект и начните новый разговор:

```bash
cd /any/project
claude
```

> **Важно:** если конфиг добавлен на уровне проекта (`.claude/settings.json`), но сервер не появляется — добавьте его в глобальный `~/.claude/settings.json`. Также убедитесь, что начали **новый разговор** — MCP-серверы регистрируются при старте сессии.

---

### Claude Desktop

Claude Desktop не привязан к директории проекта, поэтому путь нужно указать явно.

Файл:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "project-navigator": {
      "command": "sh",
      "args": ["-c", "docker run --rm -i -v \"/ABSOLUTE/PATH/TO/PROJECT:/project:ro\" -e PROJECT_ROOT=/project project-navigator-mcp"]
    }
  }
}
```

Замените `/ABSOLUTE/PATH/TO/PROJECT` на путь к нужному проекту. Перезапустите Claude Desktop.

---

### VS Code (GitHub Copilot Agent Mode)

Требует VS Code 1.99+ с GitHub Copilot.

Файл: `.vscode/mcp.json` в целевом проекте (добавьте в репозиторий — будет работать у всех участников).

```json
{
  "servers": {
    "project-navigator": {
      "type": "stdio",
      "command": "sh",
      "cwd": "${workspaceFolder}",
      "args": ["-c", "docker run --rm -i -v \"$(pwd):/project:ro\" -e PROJECT_ROOT=/project project-navigator-mcp"]
    }
  }
}
```

`${workspaceFolder}` — встроенная переменная VS Code, автоматически подставляет корень открытого проекта. Путь указывать не нужно.

Откройте Copilot Chat → переключитесь в режим **Agent** → сервер подключится автоматически.

> Отличие от других клиентов: ключ `"servers"` (не `"mcpServers"`), обязательное `"type": "stdio"` и поддержка `"cwd"` с переменными.

---

### Cursor

Файл: `~/.cursor/mcp.json` (глобально) или `.cursor/mcp.json` (в проекте)

```json
{
  "mcpServers": {
    "project-navigator": {
      "command": "sh",
      "args": ["-c", "docker run --rm -i -v \"$(pwd):/project:ro\" -e PROJECT_ROOT=/project project-navigator-mcp"]
    }
  }
}
```

Cursor запускает MCP-сервер с cwd = корень открытого проекта, поэтому `$(pwd)` подставляется автоматически. Перезапустите Cursor — инструменты появятся в Cursor Agent.

---

## Запуск без Docker

```bash
npm install
npm run build
```

Проверка:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/index.js
```

Создайте `.env` (по образцу `.env.example`):

```env
PROJECT_ROOT=/path/to/your/project
ALLOWED_COMMANDS=npm run build,npm test,npm run lint,npm run dev,npx tsc --noEmit
```

## Безопасность

- **Файловые инструменты** ограничены папкой `PROJECT_ROOT` — выход за пределы возвращает ошибку
- **`read_file`** не читает файлы с именем `.env*`
- **`run_command`** использует `child_process.spawn` (не `exec`), команда проверяется по точному совпадению с whitelist — shell-инъекции невозможны

## Логи

Сервер пишет в stderr:

```
[CALL]    list_directory  { "path": "src" }
[SUCCESS] list_directory  duration=12ms

[CALL]    run_command     { "command": "rm -rf /" }
[ERROR]   run_command     reason="command not in whitelist"
```

В логах никогда не появляется содержимое файлов и вывод команд — только метаданные вызова.

## Demo сценарии

| # | Запрос | Инструмент |
|---|---|---|
| 1 | «Покажи структуру папки src» | `list_directory` |
| 2 | «Найди все TypeScript файлы в проекте» | `find_files` |
| 3 | «Где используется `PROJECT_ROOT`?» | `search_code` |
| 4 | «Покажи строки 1–30 файла server.ts» | `read_file` |
| 5 | «Запусти тесты» | `run_command` |
