# MCP setup

**Document type:** reference

## Scope

This document describes the MCP surface of `figma-gateway.vazovski.art`.

Its responsibility is:

- Figma read/write orchestration
- rendered UI extraction
- visual planning
- mapping and reconcile support around Figma and rendered UI

It is **not** the main MCP for code mutation.

For code-side inspection and code mutation, the target system uses the separate MCP endpoint:

- `mcp.vazovski.art`

Operational rule for agents:

- use `figma-gateway` MCP for Figma/runtime-sync tasks
- use `mcp.vazovski.art` for code changes

## Current status

A local stdio MCP adapter exists for the gateway.

Main implementation points:

- `src/mcp/server.ts`
- `src/mcp/tools`
- `scripts/mcp-stdio-runner.mjs`

## Important runtime rule

For external stdio MCP clients, the supported entrypoint is the runner:

```bash
node /home/figma-gateway.vazovski.art/scripts/mcp-stdio-runner.mjs
```

Do **not** use the older direct `tsx ... src/mcp/server.ts` startup path for external clients.

That older path is no longer the canonical external entrypoint.

## Tooling surface

Gateway MCP tools include read, search and guarded write-adjacent operations around Figma/runtime-sync concerns.

The exact client-verified compatibility snapshot is documented separately in:

- `reports/client-compatibility.md`

That report is historical verification.

This document is the stable reference.

## Shared logic

The MCP server uses the same internal operations and validation schemas as the REST API.

Logic is not duplicated:

- shared layer: `src/core/figma-gateway-service.ts`
- REST and MCP call the same service layer where applicable

## Start

```bash
cd /home/figma-gateway.vazovski.art
npm install
npm run mcp:start
```

## Required environment

- `FIGMA_TOKEN`
- `FIGMA_API_BASE_URL`
- `FIGMA_TIMEOUT_MS`
- `FIGMA_MAX_RETRIES`

`API_BEARER_TOKEN` is not required for stdio MCP because it does not use HTTP auth middleware.

## External client setup

Use the runner command above for Codex, Cline, Claude Code, Cursor and similar stdio MCP clients.

The detailed per-client compatibility snapshot and sample configs are intentionally kept in:

- `reports/client-compatibility.md`

so this reference doc stays compact.

## Remote MCP note

This repository currently documents and supports a local stdio MCP adapter over the gateway.

A network-exposed remote MCP transport would be a separate implementation concern with its own:

- transport
- auth
- session handling
- public endpoint lifecycle
