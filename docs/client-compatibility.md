# Client compatibility — Figma Gateway MCP

Дата проверки: 2026-04-15
Статус: protocol-compatible with Codex / Cline / Claude Code / Cursor via stdio

## What was actually verified

Gateway-side MCP compatibility was verified through a real stdio MCP protocol smoke against the same command external clients should launch:

- command: `node /home/figma-gateway.vazovski.art/scripts/mcp-stdio-runner.mjs`
- transport: stdio
- verified protocol steps:
  - `initialize`
  - `tools/list`
  - `tools/call`

Verified tools:

1. `figma_search_aliases`
2. `figma_resolve_alias`
3. `figma_create_frame` with `dryRun: true`

Observed result:

- MCP initialize succeeded
- tools list returned 17 tools
- all 3 tool calls succeeded
- dry-run write returned `performed: false`

## Important compatibility conclusion

The gateway is confirmed compatible at the MCP protocol level for local stdio clients.

This is the compatibility basis for:

- Codex
- Cline
- Claude Code
- Cursor

These clients all support local stdio MCP servers in their official documentation. The same working stdio command can therefore be used across all of them, with client-specific config syntax only. citeturn608127view0turn608127view1turn448020view2

## Required server entrypoint

Use this command:

```bash
node /home/figma-gateway.vazovski.art/scripts/mcp-stdio-runner.mjs
```

Do **not** use the old command from earlier MCP notes:

```bash
node /home/figma-gateway.vazovski.art/node_modules/tsx/dist/cli.mjs /home/figma-gateway.vazovski.art/src/mcp/server.ts
```

That older entrypoint is not suitable for external client startup in the current project state.

## Client-specific setup

### 1. Codex

Codex stores MCP config in `~/.codex/config.toml` or project-scoped `.codex/config.toml`, and supports stdio MCP servers with `command`, `args`, `cwd`, and optional timeouts. citeturn608127view0turn339135view3

Config example:

```toml
[mcp_servers.figma_gateway]
command = "node"
args = ["/home/figma-gateway.vazovski.art/scripts/mcp-stdio-runner.mjs"]
cwd = "/home/figma-gateway.vazovski.art"
startup_timeout_sec = 20
tool_timeout_sec = 60
enabled = true
required = false
```

Saved example:

- `docs/clients/codex.config.toml`

Confirmed tools for Codex compatibility basis:

- `figma_search_aliases`
- `figma_resolve_alias`
- `figma_create_frame` (`dryRun: true`)

### 2. Cline

Cline stores server config in `cline_mcp_settings.json` and supports stdio servers with `command`, `args`, `env`, optional `alwaysAllow`, and enable/disable flags. citeturn608127view1turn339135view2

Config example:

```json
{
  "mcpServers": {
    "figma-gateway": {
      "command": "node",
      "args": [
        "/home/figma-gateway.vazovski.art/scripts/mcp-stdio-runner.mjs"
      ],
      "cwd": "/home/figma-gateway.vazovski.art",
      "env": {},
      "alwaysAllow": [
        "figma_search_aliases",
        "figma_resolve_alias",
        "figma_create_frame"
      ],
      "disabled": false
    }
  }
}
```

Saved example:

- `docs/clients/cline_mcp_settings.json`

Confirmed tools for Cline compatibility basis:

- `figma_search_aliases`
- `figma_resolve_alias`
- `figma_create_frame` (`dryRun: true`)

### 3. Claude Code

Claude Code supports local stdio MCP servers, plus JSON-based config via `.mcp.json` for project scope. It also supports `claude mcp add-json` and `claude mcp add --transport stdio`. citeturn448020view2

Recommended command-based setup:

```bash
claude mcp add --transport stdio figma-gateway -- node /home/figma-gateway.vazovski.art/scripts/mcp-stdio-runner.mjs
```

Project config example:

```json
{
  "mcpServers": {
    "figma-gateway": {
      "command": "node",
      "args": [
        "/home/figma-gateway.vazovski.art/scripts/mcp-stdio-runner.mjs"
      ],
      "env": {}
    }
  }
}
```

Saved example:

- `docs/clients/claude.project.mcp.json`

Confirmed tools for Claude compatibility basis:

- `figma_search_aliases`
- `figma_resolve_alias`
- `figma_create_frame` (`dryRun: true`)

### 4. Cursor

Cursor documents MCP support and OpenAI’s docs note that Cursor reads MCP configuration from `mcp.json`. The same standardized `mcpServers` JSON format is suitable for local stdio registration. citeturn732777search2turn608127view4

Config example:

```json
{
  "mcpServers": {
    "figma-gateway": {
      "command": "node",
      "args": [
        "/home/figma-gateway.vazovski.art/scripts/mcp-stdio-runner.mjs"
      ],
      "cwd": "/home/figma-gateway.vazovski.art",
      "env": {}
    }
  }
}
```

Saved example:

- `docs/clients/cursor.mcp.json`

Confirmed tools for Cursor compatibility basis:

- `figma_search_aliases`
- `figma_resolve_alias`
- `figma_create_frame` (`dryRun: true`)

## Confirmed incompatibilities and quirks

### 1. Old tsx/src MCP startup command is not client-safe

The previous setup path based on:

```bash
node .../tsx .../src/mcp/server.ts
```

failed as an external client entrypoint because of package export/runtime issues. This is a confirmed incompatibility for Codex/Cline/Claude/Cursor startup if that old command is used.

### 2. Dist CommonJS MCP entrypoint was not sufficient

`dist/mcp/server.js` failed when launched directly by an external client because the MCP SDK package is ESM-only in the installed version.

### 3. The MCP SDK required an additional peer dependency

The installed `@modelcontextprotocol/server@2.0.0-alpha.2` required `@cfworker/json-schema` at runtime for the external stdio path to start correctly.

### 4. Stdio framing uses newline-delimited JSON

For custom harnesses and debugging, this SDK’s stdio transport uses newline-delimited JSON messages, not `Content-Length` framing. That matters for custom probes and client debugging.

### 5. Clean stdout is mandatory

Any ordinary log output to stdout breaks stdio MCP clients. The client-safe runner must reserve stdout only for MCP messages.

## Operational recommendation

For all external local clients, standardize on one shared runner:

```bash
node /home/figma-gateway.vazovski.art/scripts/mcp-stdio-runner.mjs
```

This avoids client-specific bootstrap drift.

## Repeatable verification commands

Protocol smoke:

```bash
cd /home/figma-gateway.vazovski.art
npm run mcp:smoke
```

Runner only:

```bash
cd /home/figma-gateway.vazovski.art
npm run mcp:runner
```

## Final verdict

Compatibility is confirmed for stdio-based MCP clients at the protocol level.

Prepared connection instructions are included for:

- Codex
- Cline
- Claude Code
- Cursor

The remaining client-side work is only to paste the corresponding config into the actual client UI or config file on the developer workstation.
