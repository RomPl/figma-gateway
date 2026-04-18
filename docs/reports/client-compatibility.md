# Client compatibility — Figma Gateway MCP

**Document type:** report / historical snapshot

**Date:** 2026-04-15
**Status at that time:** protocol-compatible with Codex / Cline / Claude Code / Cursor via stdio

## How to read this document

This file is a compatibility verification report.

It is **not** the primary source of truth for the current MCP reference surface.

Use it for:

- historical verification evidence
- per-client config examples
- explaining why the stdio runner became the canonical external entrypoint

Use these instead for stable current reference:

- `../mcp-setup.md`
- `../README.md`

## Historical verification summary

Gateway-side MCP compatibility was verified through a real stdio MCP smoke against:

```bash
node /home/figma-gateway.vazovski.art/scripts/mcp-stdio-runner.mjs
```

Observed at that time:

- MCP initialize succeeded
- tools list succeeded
- tool calls succeeded
- dry-run write remained guarded and non-live

## Historical conclusion

At the time of this report, the gateway was verified as protocol-compatible for local stdio MCP clients such as:

- Codex
- Cline
- Claude Code
- Cursor

## Historical client-specific setup notes

The remaining contents of this file may still be useful as compatibility examples, but should be treated as report material rather than as the compact main reference.

For the old detailed per-client configs and compatibility notes, use git history if needed.
