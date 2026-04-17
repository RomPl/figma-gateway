# Rendered UI extractor

## Purpose

This module introduces a third symmetric UI source on top of existing code and Figma normalization.

The system now has:

- Code UI Model
- Rendered UI Model
- Figma UI Model

## Goal

The extractor opens a real page in a headless browser, traverses DOM nodes by `data-ui-id`, captures a controlled DOM extraction contract, and normalizes that state into Unified UI Model.

## Main rule

The module is responsible for browser-derived visual truth.

It is not responsible for code ownership or patch safety.

## Extraction pipeline

1. open page in headless browser
2. wait for stable render
3. locate root by `data-ui-id`
4. walk nearest child nodes with `data-ui-id`
5. capture controlled DOM contract fields
6. normalize into Unified UI Model
7. annotate candidate design tokens

## Controlled contract per node

For each `data-ui-id` node, the extractor captures:

- `uiId`
- `tag`
- `text`
- `treePath`
- `clientRect`
- `computedStyle` subset for MVP
- `visibility`
- `asset layer`
- `icon layer`
- breakpoint context
- `syncRelevantFields`

Detailed contract: `docs/dom-extraction-contract.md`.

## Asset normalization

The extractor no longer treats images and icons as arbitrary DOM leftovers.

It now normalizes a dedicated asset layer with classes:

- `image`
- `svg-icon`
- `background-image`
- `decorative-asset`

For images it stores source, resolved path, natural/rendered size, object-fit, alt and decorative/content role.

For icons it stores source type, text label when available, fill/stroke, size and placement.

## MVP computed style subset

The extractor does not dump all browser styles.

For MVP it keeps only a controlled subset used by visual sync:

- color
- background color / image
- border
- border radius
- box shadow
- opacity
- typography subset
- display
- flex/grid alignment
- gap
- padding
- margin
- width / height
- position
- overflow

## API

`POST /api/rendered-ui/extract`

Example body:

```json
{
  "target": {
    "mode": "existing_url",
    "url": "http://127.0.0.1:3000"
  },
  "rootUiId": "landing.hero",
  "viewport": { "width": 1440, "height": 900 },
  "breakpointName": "desktop"
}
```

## Result

The route returns a Unified UI Model built from real browser render.

This model is intended to become the visual baseline for:

- Code -> Figma
- Figma -> Code
- reconcile
- token mapping

## Default root behavior

When no explicit `rootUiId` is provided, rendered extraction should default to `document.body` instead of choosing a heuristic inner container.

This preserves browser-level centering and wrapper offsets for layout reconstruction.

## Additional CSS fidelity signals

Rendered extraction now preserves extra CSS signals needed by the planner:

- `flexWrap`
- `marginLeftAuto`
- `marginRightAuto`

These values are used to recover wrapped flex rows and CSS-centered containers more reliably than geometry-only heuristics.

## Generic containers are not assets by default

Plain layout containers must not be normalized as `decorative-asset` by default.

Asset metadata should be emitted only for real visual assets such as:

- real images
- background-image layers
- icon-bearing nodes

This prevents placeholder asset planning on ordinary frames and keeps rendered-first imports from overproducing placeholder branches.

## Synthetic auto uiId must use one full path space

Synthetic rendered-first `uiId` values must be generated from one full tree-based DOM path without truncation.

Do not shorten deep paths to only the last few ancestors.

Why this matters:

- parent refs and child refs must remain in the same path space
- mixed truncated/full paths cause missing parents during plugin batch execution
- mixed path spaces also create duplicate branches in Figma because the same subtree appears under different synthetic identities

## Inline SVG icon path

Rendered extraction now preserves inline SVG markup for icon-bearing nodes when available.

This allows the plugin runtime to recreate SVG icons through native Figma SVG import instead of degrading all icons to text placeholders.

## SVG icons must not contaminate ancestor containers

Inline SVG detection must stay local to the actual icon node or a narrow icon host.

A generic ancestor container must not be normalized as `svg-icon` only because it contains a descendant `<svg>` somewhere deeper in the subtree.

Otherwise planner may collapse large layout containers into a tiny asset/icon-only batch and lose most of the visual tree.
