# Отчёт — Домашнее задание: Простой MCP-сервер

## Принципы MCP

### Как IDE/агент подключается к MCP-серверу

MCP (Model Context Protocol) — протокол, позволяющий AI-агенту в IDE вызывать внешние инструменты через стандартизированный интерфейс. В этом проекте используется транспорт **stdio**: IDE (Claude Code) запускает MCP-сервер как дочерний процесс командой `node dist/index.js` и общается с ним через stdin/stdout в формате JSON-RPC 2.0. Сервер регистрируется один раз в `.claude/settings.json`, после чего агент автоматически видит его инструменты при каждом запуске. Весь протокольный трафик идёт через stdout; логи пишутся в stderr, чтобы не мешать протоколу.

### Что такое «tool» в этом сервере

**Tool** — это именованная функция с JSON-схемой входных параметров (Zod-объект) и структурированным JSON-ответом. Агент видит имя инструмента, описание и схему, и вызывает его как функцию. Сервер обрабатывает вызов, логирует его в stderr и возвращает результат через MCP-протокол. В этом проекте каждый tool реализован как пара: чистая async-функция (тестируемая независимо) + функция регистрации в McpServer.

---

## Реализован MCP-сервер

**Файл:** `src/server.ts:L1–L34`

Функция `startServer(projectRoot, allowedCommands)` (L17–L33):
1. Создаёт `McpServer` с именем `"project-navigator"` (L21)
2. Регистрирует 5 инструментов (L23–L27)
3. Подключает `StdioServerTransport` (L29–L30)
4. Пишет стартовый лог в stderr (L31–L33)

Точка входа: `src/index.ts` — загружает env-переменные через `dotenv` и вызывает `startServer`.

---

## Реализованы инструменты

### `list_directory`

**Реализация:** `src/tools/list-directory/index.ts:L10–L22`
**Регистрация в MCP:** `src/tools/list-directory/index.ts:L24–L51`
**Логи:** `src/tools/list-directory/index.ts:L31,L37,L41`

Функция `listDirectory(path, projectRoot)` читает содержимое директории через `readdir({ withFileTypes: true })` и возвращает массив с именем, типом (`"file"` или `"dir"`) и путём относительно `PROJECT_ROOT`.

Пример лога:
```
[CALL]    list_directory  {"path":"."}
[SUCCESS] list_directory  duration=8ms
```

---

### `read_file`

**Реализация:** `src/tools/read-file/index.ts:L9–L28`
**Регистрация в MCP:** `src/tools/read-file/index.ts:L30–L66`
**Логи:** `src/tools/read-file/index.ts:L37,L43,L47`

Читает файл целиком или диапазон строк (1-indexed). Блокирует `.env*` по имени файла до проверки пути. Возвращает `{ content, total_lines, path }`.

Пример лога:
```
[CALL]    read_file  {"path":"src/server.ts","start_line":1,"end_line":10}
[SUCCESS] read_file  duration=3ms
```

---

### `find_files`

**Реализация:** `src/tools/find-files/index.ts:L9–L15`
**Регистрация в MCP:** `src/tools/find-files/index.ts:L17–L48`
**Логи:** `src/tools/find-files/index.ts:L24,L31,L35`

Принимает glob-паттерн (`**/*.ts`) и возвращает список файлов относительно `PROJECT_ROOT`.

Пример лога:
```
[CALL]    find_files  {"pattern":"**/*.ts"}
[SUCCESS] find_files  duration=15ms
```

---

### `search_code`

**Реализация:** `src/tools/search-code/index.ts:L12–L53`
**Регистрация в MCP:** `src/tools/search-code/index.ts:L55–L91`
**Логи:** `src/tools/search-code/index.ts:L62,L69,L73`

Полнотекстовый поиск по файлам через `readline` + `createReadStream`. Поддерживает фильтрацию по `file_pattern`. Возвращает массив совпадений с номером строки и содержимым.

Пример лога:
```
[CALL]    search_code  {"query":"PROJECT_ROOT","file_pattern":"*.ts"}
[SUCCESS] search_code  duration=42ms
```

---

### `run_command`

**Реализация:** `src/tools/run-command/index.ts:L6–L25`
**Регистрация в MCP:** `src/tools/run-command/index.ts:L27–L53`
**Логи:** `src/tools/run-command/index.ts:L34,L40,L44`

Запускает команду из whitelist через `spawn` (без shell). Возвращает `{ stdout, stderr, exit_code, success }`.

Пример лога:
```
[CALL]    run_command  {"command":"npm test"}
[SUCCESS] run_command  duration=1823ms
```

Пример блокировки:
```
[CALL]    run_command  {"command":"rm -rf /"}
[ERROR]   run_command  reason="command not in whitelist"
```

---

## Логи и отладка

Логгер: `src/logger/index.ts:L1–L15`

Каждый вызов инструмента генерирует два события в stderr:
- `[CALL]    tool_name  {params}` — до выполнения
- `[SUCCESS] tool_name  duration=Nms` — после успеха
- `[ERROR]   tool_name  reason="..."` — при ошибке

В логах **никогда не фигурирует** содержимое файлов или вывод команд — только метаданные.

---

## Безопасность

`src/security/index.ts:L1–L15` — функция `assertInProjectRoot`:
- Блокирует абсолютные пути (`isAbsolute` check, L7–L9)
- Блокирует path traversal через `resolve` + `startsWith` (L10–L13)
- Используется во всех файловых инструментах

`read_file` дополнительно блокирует `.env*` файлы по имени (до вызова security-проверки).

`run_command` сравнивает команду со строгим whitelist (точное совпадение строк), использует `spawn` с `shell: false`.

---

## Агент корректно вызывает нужный tool

### Пример 1: `list_directory`

**Запрос:** «Покажи структуру папки src»

**Ожидаемый tool:** `list_directory`

**Вывод сервера:**
```
[CALL]    list_directory  {"path":"src"}
[SUCCESS] list_directory  duration=5ms
```

---

### Пример 2: `find_files`

**Запрос:** «Найди все TypeScript файлы в проекте»

**Ожидаемый tool:** `find_files`

**Вывод сервера:**
```
[CALL]    find_files  {"pattern":"**/*.ts"}
[SUCCESS] find_files  duration=18ms
```

---

### Пример 3: `search_code`

**Запрос:** «Где используется PROJECT_ROOT?»

**Ожидаемый tool:** `search_code`

**Вывод сервера:**
```
[CALL]    search_code  {"query":"PROJECT_ROOT"}
[SUCCESS] search_code  duration=35ms
```

---

### Пример 4: `read_file`

**Запрос:** «Покажи строки 1–20 файла server.ts»

**Ожидаемый tool:** `read_file`

**Вывод сервера:**
```
[CALL]    read_file  {"path":"src/server.ts","start_line":1,"end_line":20}
[SUCCESS] read_file  duration=2ms
```

---

### Пример 5: `run_command`

**Запрос:** «Запусти тесты»

**Ожидаемый tool:** `run_command`

**Вывод сервера:**
```
[CALL]    run_command  {"command":"npm test"}
[SUCCESS] run_command  duration=1800ms
```

---

## Tool outputs contract

Описание: `README.md` → раздел «Tool outputs contract»

Краткая сводка:

| Tool | Output |
|---|---|
| `list_directory` | `{ entries: Array<{ name, type: "file"\|"dir", path }> }` |
| `read_file` | `{ content: string, total_lines: number, path: string }` |
| `find_files` | `{ files: string[], count: number }` |
| `search_code` | `{ matches: Array<{ file, line, content }>, count: number }` |
| `run_command` | `{ stdout, stderr, exit_code: number, success: boolean }` |

Все инструменты возвращают ответ в формате: `{ content: [{ type: "text", text: JSON.stringify(result) }] }`.

---

## Интеграция с IDE и агентами

Сервер реализует открытый протокол MCP поверх stdio — он совместим с любым MCP-клиентом. Меняется только путь к конфиг-файлу и название ключа.

| Клиент | Конфиг-файл | Ключ |
|---|---|---|
| Claude Code | `.claude/settings.json` | `mcpServers` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | `mcpServers` |
| VS Code (Copilot, 1.99+) | `.vscode/mcp.json` | `servers` + `"type":"stdio"` |
| Cursor | `~/.cursor/mcp.json` | `mcpServers` |

Пример для Claude Code (Docker):

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

VS Code отличается: ключ `"servers"` и обязательное `"type": "stdio"`. У остальных клиентов формат идентичен.

**Шаги для запуска:**
1. `docker build -t project-navigator-mcp .`
2. Smoke test: `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | docker run --rm -i project-navigator-mcp`
3. Добавить конфиг в файл настроек используемого клиента
4. Перезапустить клиент — сервер появится в списке MCP
5. Проверить: спросить агента «покажи структуру папки src»

Полные примеры конфигов для всех клиентов: `README.md` → раздел «Интеграция с агентами и IDE».
