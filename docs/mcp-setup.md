# MCP Setup

## Что это за MCP и чем он не является

Этот документ описывает MCP surface именно для `figma-gateway.vazovski.art`.

Его зона ответственности:

- Figma read/write orchestration
- rendered UI extraction
- visual planning
- mapping and reconcile support around Figma and rendered UI

Он не является основным MCP для правки кода.

Для code-side inspection и code mutation в целевой системе используется отдельный MCP endpoint: `mcp.vazovski.art`.

Практическое правило для агентов:

- использовать `figma-gateway` MCP для Figma/runtime-sync задач
- использовать `mcp.vazovski.art` для изменения кода

## Что сделано

Добавлен локальный MCP adapter для gateway:

- [src/mcp/server.ts](/home/figma-gateway.vazovski.art/src/mcp/server.ts)
- tools в [src/mcp/tools](/home/figma-gateway.vazovski.art/src/mcp/tools)

Tools:

- `figma_get_file`
- `figma_get_node`
- `figma_get_nodes_batch`
- `figma_get_styles`
- `figma_get_components`
- `figma_render_node`
- `figma_search_by_name`
- `figma_search_by_text`
- `figma_resolve_alias`
- `figma_search_aliases`
- `figma_get_design_block`
- `figma_get_design_context`
- `figma_get_layout_summary`

## Важное

Этот MCP server использует те же внутренние операции и те же `zod`-схемы, что и REST API.

Логика не дублируется:

- общий слой: [src/core/figma-gateway-service.ts](/home/figma-gateway.vazovski.art/src/core/figma-gateway-service.ts)
- REST и MCP вызывают один и тот же service-layer

## Запуск

```bash
cd /home/figma-gateway.vazovski.art
npm install
npm run mcp:start
```

## Требуемые env

- `FIGMA_TOKEN`
- `FIGMA_API_BASE_URL`
- `FIGMA_TIMEOUT_MS`
- `FIGMA_MAX_RETRIES`

`API_BEARER_TOKEN` для MCP server не нужен, потому что stdio MCP не использует HTTP auth middleware.

## Подключение клиентов

Ниже локальный stdio-вариант. Он подходит для Codex, Cline, Claude Code и других клиентов, которые умеют запускать MCP server как процесс.

Команда:

```bash
node /home/figma-gateway.vazovski.art/node_modules/tsx/dist/cli.mjs /home/figma-gateway.vazovski.art/src/mcp/server.ts
```

Рабочая директория:

```bash
/home/figma-gateway.vazovski.art
```

## Пример MCP config

```json
{
  "mcpServers": {
    "figma-gateway": {
      "command": "node",
      "args": [
        "/home/figma-gateway.vazovski.art/node_modules/tsx/dist/cli.mjs",
        "/home/figma-gateway.vazovski.art/src/mcp/server.ts"
      ],
      "cwd": "/home/figma-gateway.vazovski.art",
      "env": {
        "FIGMA_TOKEN": "YOUR_FIGMA_TOKEN",
        "FIGMA_API_BASE_URL": "https://api.figma.com",
        "FIGMA_TIMEOUT_MS": "10000",
        "FIGMA_MAX_RETRIES": "2"
      }
    }
  }
}
```

## Про remote MCP

Figma официально продвигает remote MCP как preferred-путь для своего сервера и документирует подключение для клиентов вроде Codex, Cursor, VS Code и Claude Code. В этом таске реализован локальный stdio MCP adapter поверх вашего gateway, а не remote HTTP transport.

Если нужен именно remote MCP endpoint для внешнего подключения клиентов по сети, это отдельная задача: надо поднять streamable HTTP transport, auth, session handling и публичный URL.
