# Intent-based API

## Purpose

Low-level transport remains in place, but the agent now has high-level intent operations.

This layer is no longer AST-first. High-level intents now run through the rendered visual layer so the agent works from the real interface instead of only code declarations.

## High-level intents

- `reconstruct_design_from_code`
- `sync_block_to_figma`
- `sync_block_to_code`
- `sync_page_to_figma`
- `sync_page_to_code`
- `reconcile_design_and_code`
- `apply_tokens_to_figma`
- `rebind_mappings`
- `annotate_ui_ids`

## Visual-first internal decomposition

For render-aware high-level operations, the agent now runs these phases explicitly:

- `snapshot_code`
- `render_ui`
- `normalize`
- `token_resolve`
- `diff`
- `plan`
- `batch`

For reconcile, `snapshot_figma` is included as an additional phase.

## Key intents that now depend on rendered UI

Especially important intents now use rendered snapshot internally:

- `reconstruct_design_from_code`
- `sync_page_to_figma`
- `reconcile_design_and_code`
- `apply_tokens_to_figma`

## Main rule

These intents now require a `render` payload.

That is what makes the high-level agent operate on the real interface instead of guessing from AST alone.

## API

- `GET /api/intents`
- `POST /api/intents/execute`

Example:

```json
{
  "intent": "reconstruct_design_from_code",
  "payload": {
    "project": "marketing-site",
    "componentName": "Hero",
    "fileKey": "abc123",
    "sessionId": "pbs_xxx",
    "dryRun": false,
    "render": {
      "target": {
        "mode": "existing_url",
        "url": "http://127.0.0.1:3000"
      },
      "rootUiId": "landing.hero",
      "breakpoint": "desktop"
    }
  }
}
```

## Returned metadata

Intent responses now include:

- `phases`
- `artifacts`
- `result`

`artifacts` can expose things like:

- rendered node count
- token-bound node count
- visual source used by the intent

## Behavior summary

### reconstruct / sync intents

These now wrap the existing pipelines, but only after the rendered UI snapshot has been captured and normalized.

### reconcile_design_and_code

This now runs over code snapshot, Figma snapshot and rendered UI snapshot, with rendered UI as the visual source of truth.

### apply_tokens_to_figma

This now uses rendered token bindings instead of relying only on code-side declarations.

### rebind_mappings

This remains a structural remapping operation.

### annotate_ui_ids

This remains a plugin-data batch operation.


## Breakpoint-aware intents

`reconstruct_design_from_code` and `sync_page_to_figma` now accept an optional `breakpoints` array.

Example:

```json
{
  "intent": "reconstruct_design_from_code",
  "payload": {
    "project": "marketing-site",
    "componentName": "Hero",
    "breakpoints": ["mobile", "desktop"],
    "render": {
      "target": { "mode": "existing_url", "url": "http://127.0.0.1:3000" },
      "rootUiId": "landing.hero"
    }
  }
}
```

Current behavior:

- reuses the stable single-breakpoint pipeline per breakpoint
- materializes variant node refs per breakpoint family
- may queue one combined plugin batch
- intentionally keeps multi-breakpoint mapping persistence conservative until reverse-sync bindings are finalized
