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

## Установка и запуск

```bash
npm install
npm run build
```

## Настройка

Создайте `.env` (по образцу `.env.example`):

```env
PROJECT_ROOT=/path/to/your/project
ALLOWED_COMMANDS=npm run build,npm test,npm run lint,npm run dev,npx tsc --noEmit
```

## Интеграция с Claude Code

Добавьте в `.claude/settings.json`:

```json
{
  "mcpServers": {
    "project-navigator": {
      "command": "node",
      "args": ["/absolute/path/to/simple-mcp-server/dist/index.js"],
      "env": {
        "PROJECT_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

**Шаги для включения:**
1. Клонируйте репозиторий
2. Выполните `npm install && npm run build`
3. Скопируйте конфиг выше в `.claude/settings.json` вашего проекта
4. Укажите абсолютные пути в `args` и `PROJECT_ROOT`
5. Перезапустите Claude Code — сервер появится в списке MCP

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
