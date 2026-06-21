# Project Navigator MCP Server — Design Spec

**Date:** 2026-06-21
**Status:** Approved

---

## Overview

MCP-сервер «Project Navigator» предоставляет AI-агенту в IDE набор инструментов для навигации по кодовой базе и запуска безопасных команд. Агент получает возможность автономно изучать проект — без необходимости вручную копировать файлы в чат.

Транспорт: **stdio** — IDE запускает сервер как дочерний процесс и общается через stdin/stdout.

---

## Architecture

### File Structure

```
src/
  index.ts              ← точка входа: импортирует и запускает сервер
  server.ts             ← создание McpServer, регистрация инструментов
  logger.ts             ← логгер (пишет в stderr)
  tools/
    list-directory.ts   ← инструмент листинга директорий
    read-file.ts        ← инструмент чтения файлов
    find-files.ts       ← инструмент поиска файлов по glob
    search-code.ts      ← инструмент полнотекстового поиска
    run-command.ts      ← инструмент запуска whitelisted-команд
```

### Configuration (env variables)

| Variable | Default | Description |
|---|---|---|
| `PROJECT_ROOT` | `process.cwd()` | Корневая папка, доступная инструментам |
| `ALLOWED_COMMANDS` | см. ниже | Whitelist команд для `run_command`, через запятую |

**Default ALLOWED_COMMANDS:** `npm run build,npm test,npm run lint,npm run dev,npx tsc --noEmit`

### SDK

`@modelcontextprotocol/sdk` — официальный TypeScript SDK. Transport: `StdioServerTransport`.

---

## Tools Contract

### `list_directory`

Возвращает содержимое директории внутри `PROJECT_ROOT`.

**Input:**
```typescript
{ path?: string }  // относительно PROJECT_ROOT, по умолчанию "."
```

**Output:**
```typescript
{
  entries: Array<{ name: string; type: "file" | "dir"; path: string }>
}
```

---

### `read_file`

Читает содержимое файла. Опционально — диапазон строк.

**Input:**
```typescript
{ path: string; start_line?: number; end_line?: number }
// start_line и end_line — 1-indexed (первая строка = 1)
```

**Output:**
```typescript
{ content: string; total_lines: number; path: string }
```

---

### `find_files`

Ищет файлы по glob-паттерну внутри `PROJECT_ROOT`.

**Input:**
```typescript
{ pattern: string; directory?: string }  // pattern пример: "**/*.ts"
```

**Output:**
```typescript
{ files: string[]; count: number }
```

---

### `search_code`

Полнотекстовый поиск по файлам проекта.

**Input:**
```typescript
{ query: string; directory?: string; file_pattern?: string }
// file_pattern — glob-паттерн для фильтрации файлов, например "*.ts"
```

**Output:**
```typescript
{
  matches: Array<{ file: string; line: number; content: string }>;
  count: number
}
```

---

### `run_command`

Запускает команду из whitelist. Выполняется через `spawn` (не `exec`), без shell-интерполяции.

**Input:**
```typescript
{ command: string }
```

**Output:**
```typescript
{ stdout: string; stderr: string; exit_code: number; success: boolean }
```

---

## Logging

Все логи пишутся в **stderr** (stdout зарезервирован для MCP-протокола).

Каждый вызов инструмента генерирует 2 события:

```
[CALL]    list_directory  { "path": "src" }
[SUCCESS] list_directory  duration=12ms

[CALL]    run_command     { "command": "rm -rf /" }
[ERROR]   run_command     reason="command not in whitelist"
```

**Формат:** `[STATUS] tool_name  payload`

**Реализация:** модуль `logger.ts` с тремя функциями без внешних зависимостей:
- `logCall(tool, params)` — вызывается до выполнения
- `logSuccess(tool, durationMs)` — вызывается после успешного выполнения
- `logError(tool, reason)` — вызывается при ошибке

**Что НЕ логируется:** содержимое файлов, stdout/stderr команд. Только метаданные вызова.

---

## Security

### File Tools (list_directory, read_file, find_files, search_code)

Каждый путь нормализуется через `path.resolve(PROJECT_ROOT, userPath)`. Если результат не начинается с `PROJECT_ROOT` — возвращается ошибка `"access denied: path outside project root"`. Защита от path traversal (`../../etc/passwd`).

Файлы с именами, соответствующими `.env*`, явно исключены в `read_file`.

### run_command

1. Команда сверяется с `ALLOWED_COMMANDS` — точное строковое совпадение.
2. Команда разбивается на `[bin, ...args]` и запускается через `child_process.spawn` — без shell, без интерполяции.
3. `"npm test && rm -rf /"` не пройдёт whitelist, даже если `"npm test"` разрешён.

---

## IDE Integration

Конфигурация для Claude Code (`.claude/settings.json`):

```json
{
  "mcpServers": {
    "project-navigator": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "PROJECT_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

Перед подключением выполнить `npm run build`.

---

## Demo Scenarios (минимум 5 по требованию ДЗ)

| # | Запрос пользователя | Ожидаемый tool |
|---|---|---|
| 1 | «Покажи структуру папки src» | `list_directory` |
| 2 | «Найди все TypeScript файлы в проекте» | `find_files` |
| 3 | «Где используется `PROJECT_ROOT`?» | `search_code` |
| 4 | «Покажи строки 1-30 файла server.ts» | `read_file` |
| 5 | «Запусти тесты» | `run_command` |
