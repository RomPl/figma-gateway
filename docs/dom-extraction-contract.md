# DOM extraction contract

## Purpose

Rendered DOM extraction must collect a controlled visual contract, not an arbitrary dump of browser state.

This contract defines the exact MVP fields that the rendered UI extractor is allowed to treat as sync-relevant visual data.

## Required node fields

For every extracted node, the contract collects:

- `data-ui-id`
- `tag name`
- `text content`
- `computed style subset`
- `client rect`
- `visibility`
- `source url` for image/media when applicable
- `svg/icon metadata`
- `tree path`

## Canonical node shape

Each rendered node is normalized into a controlled snapshot with:

- `uiId`
- `tag`
- `text`
- `treePath`
- `clientRect`
- `computedStyle`
- `visibility`
- `media`
- `asset`
- `icon`
- `semantics`
- `breakpoint`
- `syncRelevantFields`
- `children`

## Asset layer

Rendered extraction now treats assets as a first-class layer instead of random DOM nodes.

Supported normalized asset classes:

- `image`
- `svg-icon`
- `background-image`
- `decorative-asset`

### Image fields

For image-like assets, the extractor stores:

- `sourceUrl`
- `resolvedAssetPath`
- `naturalSize`
- `renderedSize`
- `objectFit`
- `alt`
- `role` as `content` or `decorative`

### Icon fields

For icon-like assets, the extractor stores:

- `sourceType`
- `inline-svg` / `component` / `sprite` / `font-icon`
- `textLabel`
- `fill`
- `stroke`
- `size`
- `placement`
- `spriteRef` when applicable

## MVP computed style subset

Only the following CSS properties are part of the MVP contract:

- `color`
- `background-color`
- `background-image`
- `border`
- `border-radius`
- `box-shadow`
- `opacity`
- `font-family`
- `font-size`
- `font-weight`
- `line-height`
- `letter-spacing`
- `text-align`
- `display`
- `flex/grid alignment`
- `gap`
- `padding`
- `margin`
- `width/height`
- `position`
- `overflow`

## Normalized property mapping

The extractor stores that subset in normalized camelCase fields:

- `color`
- `backgroundColor`
- `backgroundImage`
- `borderColor`
- `borderWidth`
- `borderStyle`
- `borderRadius`
- `boxShadow`
- `opacity`
- `fontFamily`
- `fontSize`
- `fontWeight`
- `lineHeight`
- `letterSpacing`
- `textAlign`
- `display`
- `flexDirection`
- `alignItems`
- `alignContent`
- `justifyContent`
- `justifyItems`
- `justifySelf`
- `gap`
- `rowGap`
- `columnGap`
- `paddingTop`
- `paddingRight`
- `paddingBottom`
- `paddingLeft`
- `marginTop`
- `marginRight`
- `marginBottom`
- `marginLeft`
- `width`
- `height`
- `position`
- `overflowX`
- `overflowY`

## Sync-relevant fields

For MVP, visual sync should treat the following fields as sync-relevant:

- `text`
- `visibility.visible`
- `clientRect.width`
- `clientRect.height`
- all fields from the normalized `computedStyle` subset
- image asset source and sizing fields
- icon fill/stroke/size/placement fields

## Explicit non-goals for MVP contract

The extractor should not treat all browser-computed data as sync-relevant.

The following are deliberately not part of the MVP visual contract baseline:

- animations
- transitions
- transform matrices as primary sync fields
- filters and backdrop filters
- blend modes
- masks and clipping paths
- unstable ephemeral runtime state
- arbitrary event-derived visual states unless explicitly requested

## Result

With this contract, rendered extraction becomes controlled and predictable.

The system collects not "everything the browser knows", but the useful visual contract required for safe visual sync.
