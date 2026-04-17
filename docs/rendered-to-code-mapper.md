# Rendered UI -> Code mapper

## Purpose

This layer connects browser-derived visual truth with source ownership in code.

It answers not only:

- how does this block look?

but also:

- where should it be changed in code?

## Main rule

Each Rendered UI node should be linked to code ownership when possible.

The preferred binding is a stable exact `uiId` match.

If no stable `uiId` match exists, the system may use fallback heuristics, but such a match must be marked unstable and scored with lower confidence.

## Mapping output per rendered node

Each rendered node is annotated with:

- `uiId`
- `code source mapping`
- `JSX path`
- `component name`
- `file path`
- `confidence`
- `matchType`
- `stable`

## Match types

### `exact_ui_id`

Used when rendered node `uiId` exactly matches a code node `uiId`.

- confidence: `1.0`
- stable: `true`

### `heuristic_fallback`

Used when exact `uiId` matching is unavailable and the mapper must rely on kind, text, role, or tree-path similarity.

- confidence: less than `1.0`
- stable: `false`

### `unmatched`

Used when no acceptable code binding is found.

- confidence: `0`
- stable: `false`

## API

`POST /api/rendered-ui/map-to-code`

Example body:

```json
{
  "rootDir": "/repo",
  "render": {
    "target": {
      "mode": "existing_url",
      "url": "http://127.0.0.1:3000"
    },
    "rootUiId": "landing.hero"
  }
}
```

## Result

The route returns a rendered UI document enriched with code ownership metadata.

This becomes the bridge between:

- visual truth from browser render
- patch location from AST

## Segmentation before ownership enrichment

Rendered snapshots are now segmented before code ownership enrichment.

This keeps rendered-first planning and rendered->code mapping aligned around the same visual block boundaries instead of mixing raw DOM wrappers with patch ownership nodes.
