# Figma → UI Model extractor

## Goal

This is the symmetric projection layer for Unified UI Model.

The system now has two comparable sources:

- UI from code
- UI from Figma

## Supported Figma input

Extractor reads:

- pages
- frames
- sections
- text nodes
- fills
- typography
- auto layout
- padding
- spacing
- constraints
- node names

For exact stable sync identity, plugin bridge export path can also include:

- `uiId` from plugin data

## Two extraction paths

### 1. Backend REST extractor

Route:

- `POST /api/figma-ui/extract`

This uses regular Figma file reads and converts the returned file tree into Unified UI Model.

Good for:

- read-only comparison
- backend-side normalization
- quick UI snapshots

### 2. Plugin-enriched snapshot

Route:

- `POST /api/figma-ui/export-snapshot`

Command type:

- `export_ui_snapshot`

This queues a plugin bridge command and returns a richer UI snapshot from the live Figma plugin runtime, including `uiId` from plugin data when available.

Good for:

- precise sync
- stable mapping through `uiId`
- extracting plugin-only metadata unavailable from REST file reads

## Result format

Both paths produce Unified UI Model document shape:

```json
{
  "version": "ui-model.v1",
  "root": {
    "kind": "page",
    "uiId": "page.0_1",
    "name": "Page 1",
    "children": []
  }
}
```

## Notes

- backend extractor uses Figma REST tree and falls back to generated `uiId` when plugin data is unavailable
- plugin export uses live plugin runtime and can return actual `uiId` from plugin data
- both outputs are intended to be diffed against the Code → UI Model parser output
