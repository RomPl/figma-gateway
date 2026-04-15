# Mapping registry

## Purpose

Mapping registry is the durable correspondence layer between code UI and Figma UI.

It is separate from the basic `ui_blocks` registry.

- `ui_blocks` stores stable block identity and binding metadata
- `ui_mappings` stores actual code ↔ Figma correspondence and sync state

This is the table the agent uses to reliably move between the two worlds.

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

## Why it matters

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
