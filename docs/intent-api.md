# Intent-based API

## Purpose

Low-level transport remains in place, but the agent now has high-level intent operations.

This is the layer that makes the system look like a universal agent instead of only a transport bus.

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

## Internal decomposition

Each high-level intent resolves into one or more phases:

- snapshot
- normalize
- diff
- merge plan
- batch low-level operations

The exact phases depend on the intent.

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
    "dryRun": false
  }
}
```

## Behavior summary

### reconstruct / sync intents

These wrap the existing code-to-figma or figma-to-code pipelines.

### reconcile_design_and_code

This wraps three-way reconcile over code, Figma, and last synced state.

### apply_tokens_to_figma

This converts token-backed UI state into low-level Figma write batch operations.

### rebind_mappings

This rebuilds durable code ↔ Figma correspondences from the current normalized models.

### annotate_ui_ids

This batches plugin data writes so live Figma nodes receive stable `uiId` annotations.
