# Asset pipeline

## Purpose

Images and icons are no longer treated as secondary cases.

They now participate in the common sync pipeline through a dedicated asset registry and explicit planner/diff behavior.

## Asset registry

The registry stores asset records for rendered image and svg/icon usage.

Stored fields:

- `source path`
- `resolved URL`
- `hash`
- `dimensions`
- `role`

Additional sync fields:

- `asset kind`
- `figma strategy`
- optional metadata

## Figma handling

Planner now distinguishes:

- `image_fill`
- `vector_icon`
- `placeholder`

This allows the system to decide whether a rendered asset should become:

- an image fill in Figma
- a vector/icon insertion in Figma
- a placeholder when no stable asset ref exists yet

## Code handling

Figma -> Code diff now distinguishes between:

- `asset_ref_change`
- `layout_around_asset_change`

So the system can reason whether a patch should change the referenced asset or only the layout around the same asset.

## API

- `GET /api/assets`
- `GET /api/assets/:assetId`

## Result

Images and icons are now part of the shared sync model, registry and diff/planner behavior instead of being handled as ad hoc exceptions.

## Runtime image fallback for inline SVG icons

When native vector reconstruction fails, the plugin runtime may still preserve visual fidelity by converting sanitized SVG markup into an image-backed node.

This keeps icon visuals closer to the browser result while preserving the surrounding wrapper/layout structure and stable `uiId` mapping.
