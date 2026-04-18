# Figma Gateway

Agent-oriented backend and plugin-bridge for bidirectional synchronization between live UI, Figma and code.

It is not only a Figma importer.

Its target role is to let an autonomous agent:

- reconstruct a beauty Figma mockup from a live project or URL
- preserve stable reverse-sync compatibility with code
- apply future block-level edits from natural-language commands
- propagate Figma changes safely back into code through a separate code-editing MCP

## Runtime responsibility split

In the target system the responsibilities are intentionally split across two endpoints:

- `figma-gateway.vazovski.art` -> Figma interaction, rendered extraction, visual planning, reconcile and mapping
- `mcp.vazovski.art` -> code-side inspection and code mutation

`figma-gateway` may determine that a code change is required, but code edits themselves belong to the separate code MCP.

## Product goal

The intended end-state and documentation entrypoints are documented in:

- `docs/README.md`
- `docs/agent-product-goal.md`
- `docs/architecture.md`
- `docs/agent-canonical-flow.md`

When context is limited, start with `docs/README.md` and follow the minimal reading path there.

## Requirements

- Node.js 20+

## Quick start

```bash
nvm use
cp .env.example .env
npm install
npm run dev
```

Production run:

```bash
nvm use
npm install
npm run build
npm start
```

## Runtime isolation

This project does not use Python `venv`, because it is a Node.js backend.
Isolation is provided through local dependencies in `node_modules` and the fixed Node version in `.nvmrc`.

## Available endpoints

- `GET /health`
- `GET /version`

## MVP scope of the first version

The first working version remains intentionally narrow.

Supported:

- React + TypeScript
- basic layout components
- text
- buttons
- images
- sections / frames / groups
- colors
- typography
- spacing
- border radius
- auto layout

Not part of the first version:

- complex business logic understanding
- animations
- complex canvas/WebGL UI
- responsive diff across all breakpoints at once
- full round-trip for arbitrary technologies

Detailed scope: `docs/mvp-scope-v1.md`.

## Design tokens as a shared truth layer

The project supports a design token registry as a shared source of truth between code and Figma.

Supported categories:

- colors
- spacing
- typography
- radius
- shadows
- breakpoints

Tokens may map simultaneously to:

- code refs (`className`, `css var`, file/export)
- Figma refs (`variableId`, `styleId`, collection)

Details: `docs/design-tokens.md`.

## Main architectural model

The system must reason through five aligned representations:

- Code AST -> structural truth and safe patch ownership
- Rendered DOM/CSS -> visual truth
- Design tokens -> semantic design intent
- Figma snapshot -> editable design target
- Mapping registry -> durable sync memory

The main rule is:

Visual truth comes from browser render, not from AST declarations alone.

## Configuration

All runtime config is read from environment variables only.

| Variable | Description | Default |
| --- | --- | --- |
| `NODE_ENV` | Runtime environment | `development` |
| `HOST` | Bind host | `0.0.0.0` |
| `PORT` | HTTP port | `3000` |
| `LOG_LEVEL` | Pino log level | `info` |
| `APP_NAME` | Service name | `figma-gateway` |
| `APP_VERSION` | Service version | `0.1.0` |

## Scripts

- `npm run dev` -> development mode
- `npm run build` -> TypeScript build to `dist/`
- `npm start` -> production build startup
- `npm run check` -> type checking

## Structure

```text
src/
  api/
  config/
  core/
  mcp/
  types/
  utils/
docs/
openapi/
tests/
```
