# Audit Trail

Gateway stores an audit trail for every REST request and every MCP tool execution.

## What is recorded

- who initiated the call
- when it happened
- REST endpoint or MCP tool name
- sanitized input parameters
- success or error
- error code and message when present

Audit events are stored in SQLite table `audit_events`.

## REST actors

REST events use:

- `x-actor-id` header when provided
- `bearer-client` when a bearer token is present
- `anonymous-client` otherwise

Additional metadata:

- request id
- client IP
- user agent

## MCP actors

MCP events are stored with actor `mcp-client`.

## Sensitive data handling

Audit params are sanitized before persistence.

Keys matching these patterns are redacted:

- `authorization`
- `token`
- `secret`
- `password`
- `cookie`
- `api_key`

Redacted values are stored as `[REDACTED]`.

## Dry-run foundation

Future write operations must go through the shared types in [src/core/figma-write-types.ts](/home/figma-gateway.vazovski.art/src/core/figma-write-types.ts).

Current state:

- write abstractions exist
- `dryRun` is part of the shared context
- no real write routes
- no real write MCP tools
- no destructive actions are enabled
