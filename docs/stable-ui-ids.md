# Stable UI IDs between code and Figma

## Why this exists

Stable `uiId` is the primary cross-runtime identifier for synchronized UI blocks.

Without this, instructions such as:

- "change this hero block"
- "update footer contacts"
- "compare pricing cards in code and Figma"

remain fragile, because names, positions, and node ids are not reliable enough across edits.

## Canonical examples

Recommended ids:

- `hero.primary`
- `pricing.cards`
- `footer.contacts`
- `header.nav`
- `landing.hero`

## Storage model

### In code

Preferred marker for web code:

```tsx
<section data-ui-id="landing.hero">
```

Alternative markers supported by registry metadata:

- comment marker
- framework metadata
- custom extractor-specific metadata

### In Figma

Preferred binding:

- plugin data
- key: `figma-gateway.ui-id`
- value: stable `uiId`

Fallback binding types tracked by registry:

- `shared-plugin-data`
- `node-name`

## Registry model

Gateway now has a dedicated `ui_blocks` registry table and API.

Each record may bind together:

- `uiId`
- project
- Figma `fileKey`
- Figma `nodeId`
- code repository
- code path
- code export
- code selector
- binding metadata

This gives the agent a durable bridge:

`user intent -> uiId -> code block + figma block -> compare/update targeted block`

## API

### Upsert registry entry

`POST /api/ui-blocks`

### List entries

`GET /api/ui-blocks`

### Resolve exact id

`GET /api/ui-blocks/:uiId`

or

`POST /api/resolve-ui-block`

### Search

`POST /api/search/ui-blocks`

## Plugin runtime support

Plugin bridge now supports `uiId` in practice:

- `create-frame` accepts `uiId` and writes it into Figma plugin data
- `create-section` accepts `uiId` and writes it into Figma plugin data
- `create_text` accepts `uiId` and writes it into Figma plugin data
- `find_nodes` supports `query.uiId`
- `set_plugin_data` can write `uiId`
- `get_plugin_data` can read `uiId`

Namespace used in plugin runtime:

- namespace: `figma-gateway`
- key: `ui-id`
- stored composite key: `figma-gateway.ui-id`

## Recommended workflow

1. Mark code block with `data-ui-id="landing.hero"`
2. Store same `uiId` in Figma node plugin data
3. Register both sides in gateway via `/api/ui-blocks`
4. Use `uiId` as the main agent-facing identifier
5. Use names and geometry only as fallback signals, not as source of truth

## Practical outcome

This makes targeted sync possible:

- find block in code
- find same block in Figma
- compare only that block
- update only that block
- preserve stable identity through visual renames and layout moves
