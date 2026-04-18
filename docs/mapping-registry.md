# Mapping registry

## Purpose

Mapping registry is the durable correspondence layer between code UI and Figma UI.

It is separate from the basic `ui_blocks` registry.

- `ui_blocks` stores stable block identity and binding metadata
- `ui_mappings` stores actual code <-> Figma correspondence and sync state

This is the table the agent uses to reliably move between the two worlds across repeated tasks.

It is also one of the key foundations for the target product described in [agent-product-goal.md](./agent-product-goal.md).

## Why it matters for the product goal

Without durable mapping memory, the system would have to re-match blocks from scratch every time the user says things like:

- "update this block"
- "sync this block from Figma to code"
- "transfer this page again"

That would make the agent fragile and non-deterministic.

Mapping registry is the memory that allows:

- repeated operations on the same block
- explicit sync direction decisions
- last-sync baseline comparison
- safer reconcile behavior
- future evolution from raw `uiId` matching toward stronger block identity

## Stored fields

Each mapping stores:

- `uiId`
- code file
- component name
- selector / source range
- JSX path
- Figma file key
- Figma node id
- semantic role
- code snapshot hash
- Figma snapshot hash
- code snapshot
- Figma snapshot
- last sync direction
- last synced at
- last synced code hash
- last synced Figma hash

Over time this layer may also carry richer identity metadata, but stable `uiId` compatibility must remain intact.

## Example entity

```json
{
  "uiId": "landing.hero",
  "code": {
    "file": "src/components/Hero.tsx",
    "component": "Hero"
  },
  "figma": {
    "fileKey": "abc123",
    "nodeId": "12:45"
  },
  "sync": {
    "lastDirection": "code_to_figma",
    "lastSyncedAt": "2026-04-15T12:00:00Z"
  }
}
```

## Storage

Stored in backend SQLite table:

- `ui_mappings`

## API

- `POST /api/ui-mappings`
- `GET /api/ui-mappings`
- `GET /api/ui-mappings/:uiId`
- `POST /api/resolve-ui-mapping`
- `POST /api/search/ui-mappings`

## Product-level role

At this point the system already has:

- `Code -> UiModel`
- `Figma -> UiModel`
- stable `uiId`

Mapping registry adds the missing durable sync memory:

`uiId -> code location + figma location + last sync state`

That allows the agent to:

- reopen prior correspondences safely
- avoid re-matching from scratch on every task
- decide sync direction intentionally
- compare snapshot hashes before writing
- support reconcile against last accepted state

## Compatibility rule

Mapping registry should evolve toward richer block identity, but it must not discard the current reverse-sync contract.

Rules:

- stable `uiId` remains the primary cross-runtime key
- richer identity metadata should be additive first
- planner beautification must not silently sever stored code/Figma bindings
- remapping should be explicit and reviewable when identity confidence drops
