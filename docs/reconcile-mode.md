# Diff engine and reconcile mode

## Purpose

The system now supports three sync modes:

- `code_to_figma`
- `figma_to_code`
- `reconcile`

This matters when code and Figma changed in parallel.

## What reconcile does now

Reconcile performs a four-state comparison:

- current Code AST state
- current Rendered UI state
- current Figma state
- last synced state from `ui_mappings` snapshots

Then it:

- determines changed fields on each source
- detects source-specific conflicts
- builds a merge plan with source priorities
- marks conflicts separately instead of auto-merging them

## Merge priorities

Reconcile now follows explicit truth priorities:

- structural truth — AST
- visual truth — rendered DOM
- design truth — tokens
- design editing truth — Figma

## Example conflict classes

- `AST changed, render unchanged`
- `render changed, Figma unchanged`
- `Figma changed, code changed differently`
- `rendered and Figma diverged visually`

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
- `asset`
- `icon`
- `tokens`

## Merge plan behavior

### `code_to_figma`

Code AST structural truth is authoritative.

### `figma_to_code`

Figma design editing truth is authoritative.

### `reconcile`

- AST-only structural changes -> target `figma`
- rendered-only visual changes -> target `figma`
- token truth changes -> target `figma`
- Figma-only editing changes without rendered confirmation -> target `code`
- conflicting multi-source changes -> target `conflict`

## API

`POST /api/sync/reconcile`

Example body:

```json
{
  "project": "marketing-site",
  "fileKey": "abc123",
  "rootDir": "/repo",
  "mode": "reconcile",
  "render": {
    "target": {
      "mode": "existing_url",
      "url": "http://127.0.0.1:3000"
    },
    "rootUiId": "landing.hero"
  },
  "uiIds": ["landing.hero"]
}
```

## Result

Returns:

- field-level changes across four sources
- merge plan with priority basis
- conflict list with conflict classes
- rendered state used as visual truth input

## Why this matters

Reconcile is no longer just a comparison of two trees.

It can reason separately about:

- what code structurally declares
- what browser render actually shows
- what Figma currently targets
- what the last synced baseline was


## Breakpoint-aware reconcile

A new route now orchestrates reconcile across several breakpoint families:

`POST /api/sync/reconcile-breakpoints`

Current behavior:

- reuses the stable single-breakpoint reconcile pipeline per breakpoint
- returns `resultsByBreakpoint`
- keeps conflict classification and merge priorities identical to single-breakpoint reconcile
- remains diagnostic/planning-first until variant-group reverse-sync bindings are finalized


The breakpoint-aware reconcile route now also returns `summaryByBreakpoint`, which gives a compact comparison of conflict counts, merge-plan counts and rendered planning context per breakpoint family.
