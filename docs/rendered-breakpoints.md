# Rendered breakpoint snapshots

## Purpose

The same UI block can look different across screen sizes.

The rendered layer now supports explicit breakpoint-aware snapshots so the system can understand that one `uiId` may have different visual states on different viewports.

## Supported viewport presets

MVP presets:

- `mobile`
- `tablet`
- `desktop`

Default preset sizes:

- `mobile` → `390x844`
- `tablet` → `768x1024`
- `desktop` → `1440x900`

## MVP scope

The system does **not** try to auto-sync all breakpoints at once.

MVP support is explicit only:

- `breakpoint=desktop`
- `breakpoint=mobile`
- or an explicit list through breakpoint snapshot extraction

## Single-breakpoint extraction

`POST /api/rendered-ui/extract`

Example:

```json
{
  "target": {
    "mode": "existing_url",
    "url": "http://127.0.0.1:3000"
  },
  "rootUiId": "landing.hero",
  "breakpoint": "mobile"
}
```

The extractor derives the viewport preset automatically and stores the active breakpoint in the rendered snapshot.

## Multi-breakpoint snapshot extraction

`POST /api/rendered-ui/extract-breakpoints`

Example:

```json
{
  "target": {
    "mode": "existing_url",
    "url": "http://127.0.0.1:3000"
  },
  "rootUiId": "landing.hero",
  "breakpoints": ["mobile", "desktop"]
}
```

This returns a snapshot set keyed by breakpoint.

## Result

The rendered layer can now preserve separate snapshots for:

- the same block on mobile
- the same block on tablet
- the same block on desktop

That gives the system a foundation for future breakpoint-aware reconcile and sync without forcing automatic multi-breakpoint patching in MVP.


## Variant-set contract

To prepare future multi-breakpoint Figma planning, rendered and planned roots now carry a `breakpointVariantSet` metadata block.

It records:

- active breakpoint family
- available breakpoint families
- variant group id shared by future related variants
- whether the current run is single-breakpoint or already multi-snapshot-ready

Current MVP still plans one active breakpoint per run, but the contract is now explicit so future `desktop` / `tablet` / `mobile` Figma variants can remain identity-safe.


## Multi-breakpoint rendered-first planning

A new route now prepares multi-breakpoint rendered-first Figma plans:

`POST /api/rendered-ui/import-breakpoints-to-figma`

Current behavior:

- extracts several rendered snapshots (`desktop` / `tablet` / `mobile`)
- builds a separate plan per breakpoint
- materializes variant-specific node refs to avoid cross-breakpoint cleanup collisions
- can queue one combined plugin batch
- intentionally does **not** persist final multi-breakpoint mapping bindings yet

This is a compatibility-first groundwork step for future real multi-breakpoint Figma import.


## Code-backed multi-breakpoint build

A new route now orchestrates code-backed multi-breakpoint planning:

`POST /api/code-to-figma/build-breakpoints`

Current behavior:

- reuses the stable single-breakpoint `code-to-figma` pipeline once per breakpoint
- materializes variant node refs per breakpoint before queueing
- can queue one combined plugin batch
- intentionally keeps mapping persistence conservative until multi-breakpoint reverse-sync bindings are finalized


## Breakpoint-aware diagnostics

A new route now compares rendered diagnostics across breakpoint families:

`POST /api/rendered-ui/diagnose-breakpoints`

It returns one diagnostic result per breakpoint using the same single-breakpoint diagnose logic under the hood.


## Variant-group preview scaffold

Multi-breakpoint routes now return a `variantGroup` preview object.

It is not a final stored binding yet.

It exists to give the agent a stable scaffold for:

- one logical variant group id
- the original root uiId
- per-breakpoint variant uiIds
- aliases that can later participate in durable reverse-sync bindings


## Derived variant-group registry

A new additive registry surface is available for multi-breakpoint memory:

- `GET /api/variant-groups`
- `POST /api/search/variant-groups`

This registry is derived from existing mapping snapshots and variant metadata. It does not replace authoritative `uiId` reverse-sync bindings, but it gives the agent a stable way to discover logical breakpoint groups.
