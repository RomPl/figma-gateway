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
