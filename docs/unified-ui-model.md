# Unified UI Model

## Purpose

Unified UI Model is the common internal language used by the agent to think about interface structure and synchronization.

It must no longer be built only from code-side parsing and Figma-side parsing. It now sits between four sources:

- Code AST
- Rendered UI Snapshot
- Figma Snapshot
- Design Tokens

## Authority split

Unified UI Model does not replace source authority. It unifies them.

- Code AST tells the system where the block lives and how it can be patched.
- Rendered UI Snapshot tells the system how the block really looks in browser render.
- Design Tokens tell the system which semantic design decision explains a raw value.
- Figma Snapshot tells the system what the editable design target is.

## Main rule

For visual synchronization, Rendered UI Snapshot is the primary visual baseline.

Code AST is not the primary source of visual truth. It is the primary source of source mapping and safe patch ownership.

## Supported kinds

- `page`
- `section`
- `frame`
- `group`
- `text`
- `image`
- `button`
- `input`
- `card`
- `list`
- `icon`
- `component_instance`

## Core node shape

```json
{
  "kind": "section",
  "uiId": "landing.hero",
  "name": "Hero",
  "layout": {
    "type": "vertical",
    "gap": 24,
    "padding": { "top": 64, "right": 64, "bottom": 64, "left": 64 }
  },
  "declarativeStyle": {
    "fill": "color.brand.surface",
    "radius": 24
  },
  "computedStyle": {
    "backgroundColor": "rgb(15, 23, 42)",
    "display": "flex",
    "gap": 24
  },
  "boundingBox": { "x": 0, "y": 0, "width": 1440, "height": 720 },
  "responsive": { "viewportWidth": 1440, "breakpointName": "desktop" },
  "children": []
}
```

## Model layers

Unified UI Model now separates three different visual meanings.

### Declarative style

What code or Figma explicitly declares.

Field:

- `declarativeStyle`

Typical source:

- JSX props / class-derived declarations
- Figma fills, strokes, radius, typography

### Computed style

What browser render actually resolves after cascade, inheritance and layout.

Field:

- `computedStyle`

Typical source:

- Rendered DOM snapshot

### Semantic tokens

What design-system decision explains the value.

Field:

- `semanticTokens`

Typical source:

- token registry
- code-to-token mapping
- figma-to-token mapping

## Rendered-specific fields

To support DOM-derived data without hiding it inside `meta`, `UiNode` now includes:

- `computedStyle`
- `boundingBox`
- `asset`
- `icon`
- `state`
- `responsive`

These fields let one model hold AST, DOM and Figma views without collapsing their meanings into one flat style block.

## Backward compatibility

Legacy fields remain available:

- `style`
- `tokens`

They are kept for compatibility, but the preferred fields going forward are:

- `declarativeStyle`
- `computedStyle`
- `semanticTokens`

## Supported properties

- size
- position
- spacing
- padding
- layout direction
- alignment
- text content
- declarative style
- computed style
- semantic tokens
- bounding box
- asset info
- state info
- responsive context
- visibility
- semantic role

## Module

Implementation lives in:

- `src/core/ui-model.ts`

It provides:

- TypeScript types
- Zod schemas
- serialization
- deserialization
- sync-required field resolution

## Serialization contract

Document shape:

```json
{
  "version": "ui-model.v1",
  "root": { "kind": "page", "uiId": "root", "visible": true, "children": [] }
}
```

## Fields required for sync

Always required:

- `kind`
- `uiId`
- `visible`

Additionally by kind:

- `text` → `text`
- `image` → `size`
- `button` → `name`
- `input` → `name`

Conditionally required when present in the node:

- `layout.type`
- `padding`
- `spacing`
- `declarativeStyle.fill`
- `declarativeStyle.stroke`
- `declarativeStyle.radius`
- `declarativeStyle.text`
- `computedStyle`
- `boundingBox`
- `asset`
- `state`
- `responsive`
- `semanticTokens`

## Normalization rule

When multiple sources disagree, the model should preserve their link, but visual fields should be normalized from Rendered UI Snapshot first.

In practice:

- structural ownership comes from Code AST
- declarative style comes from Code AST or Figma Snapshot
- computed visual fields come from Rendered UI Snapshot
- semantic token references come from Tokens
- design-side targets come from Figma Snapshot

## Why this matters

Without Unified UI Model, code parsing and Figma parsing remain two different worlds.

With it, the agent can:

- normalize code into one tree
- normalize rendered UI into one visual tree
- normalize Figma into one tree
- diff trees by `uiId`
- separate patch ownership from visual truth
- update only the fields that matter for sync
