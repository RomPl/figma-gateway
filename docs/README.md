# Documentation map

Start here.

This directory contains four different kinds of documents:

- **reference** — current system behavior and architecture
- **roadmap** — target state and next evolution
- **planned** — partial or future integrations
- **reports** — point-in-time verification snapshots

## Minimal reading path for agents

If context is limited, read only these first:

1. `agent-product-goal.md`
2. `architecture.md`
3. `agent-canonical-flow.md`
4. `roadmap.md`
5. `rendered-breakpoints.md`
6. `intent-api.md`

That is the shortest path to understand the current product goal, runtime model and active direction.

## Current reference docs

Read these when changing current behavior:

- `architecture.md`
- `agent-canonical-flow.md`
- `rendered-breakpoints.md`
- `reconcile-mode.md`
- `mapping-registry.md`
- `intent-api.md`
- `rendered-ui-extractor.md`
- `code-to-figma-pipeline.md`
- `figma-to-code-pipeline.md`
- `rendered-to-code-mapper.md`
- `mcp-setup.md`
- `plugin-bridge-setup.md`
- `plugin-command-bus.md`

## Roadmap docs

Read these for target state and implementation direction:

- `agent-product-goal.md`
- `roadmap.md`
- `render-first-roadmap.md`
- `mvp-scope-v1.md`

## Planned / partial docs

These describe integrations or surfaces that are not the main stable reference yet:

- `code-connect-plan.md`
- `gpt-actions-setup.md`

## Operational docs

- `deploy.md`
- `operations.md`
- `troubleshooting.md`
- `security.md`
- `audit.md`
- `browser-renderer.md`
- `asset-pipeline.md`
- `cache.md`

## Reports

These are historical verification snapshots, not the main source of truth for current behavior:

- `reports/acceptance-checklist.md`
- `reports/client-compatibility.md`

## Notes on removed temporary planning docs

The repository previously had temporary implementation-tracking docs such as:

- `execution-plan-surface-aware-planning.md`
- `task-17-page-file-creation-plan.md`

Those were intentionally removed after their useful parts were absorbed into the stable docs above.

Rule of thumb:

- prefer **reference** docs over **reports**
- prefer **reference** docs over old task-specific execution logs
- use **roadmap** docs for direction, not for current endpoint truth
