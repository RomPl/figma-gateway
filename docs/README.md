# Documentation map

This directory contains both long-lived reference docs and narrower implementation docs.

Start here instead of scanning every markdown file.

## Core product and architecture

Read these first:

- `agent-product-goal.md` — product north star and target operating model
- `architecture.md` — system architecture and source-of-truth model
- `agent-canonical-flow.md` — canonical agent execution loop
- `roadmap.md` — main product and implementation roadmap

## Multi-breakpoint and reverse-sync evolution

Read these when working on responsive / variant-aware behavior:

- `rendered-breakpoints.md`
- `reconcile-mode.md`
- `mapping-registry.md`
- `intent-api.md`

## Visual pipeline and fidelity

Read these when working on extraction, planning and visual fidelity:

- `render-first-roadmap.md`
- `rendered-ui-extractor.md`
- `rendered-ui-snapshot.md`
- `code-to-figma-pipeline.md`
- `figma-to-code-pipeline.md`
- `rendered-to-code-mapper.md`
- `visual-confidence.md`
- `visual-guardrails.md`

## Code and Figma integration surfaces

- `mcp-setup.md` — figma-gateway MCP surface
- `plugin-bridge-setup.md`
- `plugin-command-bus.md`
- `code-connect-plan.md` — read-model for future Code Connect integration

## Operational docs

- `deploy.md`
- `operations.md`
- `troubleshooting.md`
- `security.md`
- `audit.md`

## Notes on removed temporary planning docs

The repository previously had temporary implementation-tracking docs such as:

- `execution-plan-surface-aware-planning.md`
- `task-17-page-file-creation-plan.md`

Those were intentionally removed after their useful parts were absorbed into the stable docs above.

The project should prefer durable reference docs over long-lived temporary execution logs.
