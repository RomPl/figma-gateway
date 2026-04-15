# Diff engine and reconcile mode

## Purpose

The system now supports three sync modes:

- `code_to_figma`
- `figma_to_code`
- `reconcile`

This matters when code and Figma changed in parallel.

## What reconcile does

Reconcile performs a three-way comparison:

- current code UI
- current Figma UI
- last synced state from `ui_mappings` snapshots

Then it:

- determines changed fields on each side
- detects conflicting fields
- builds a merge plan
- marks conflicts separately instead of auto-merging them

## Example conflicts

- text changed in both code and Figma
- layout changed in both places
- block deleted in code but modified in Figma

## Current engine

Implementation files:

- `src/core/ui-diff-engine.ts`
- `src/core/reconcile-pipeline.ts`

The diff engine tracks field-level changes for:

- `text`
- `style`
- `layout`
- `order`
- `structure`
- `visibility`

## Merge plan behavior

### `code_to_figma`

Code is authoritative.

### `figma_to_code`

Figma is authoritative.

### `reconcile`

- fields changed only in Figma → target `code`
- fields changed only in code → target `figma`
- fields changed differently in both → target `conflict`

## API

`POST /api/sync/reconcile`

Example body:

```json
{
  "project": "marketing-site",
  "fileKey": "abc123",
  "rootDir": "/repo",
  "mode": "reconcile",
  "uiIds": ["landing.hero"]
}
```

## Result

Returns:

- field-level changes
- merge plan
- conflict list
- notes about three-way comparison

## Why this matters

At this point the system is no longer one-directional.

It can reason about divergence between code and Figma instead of assuming one side always wins.
