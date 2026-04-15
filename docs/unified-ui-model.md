# Unified UI Model

## Purpose

Unified UI Model is the common internal language used by the agent to think about interface structure.

Both code-side UI and Figma-side UI should be projected into the same model before comparison, sync, or transformation.

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
  "style": {
    "fill": "color.brand.surface",
    "radius": 24
  },
  "children": [
    {
      "kind": "text",
      "uiId": "landing.hero.title",
      "role": "headline",
      "text": "Build faster",
      "children": []
    }
  ]
}
```

## Supported properties

- size
- position
- spacing
- padding
- layout direction
- alignment
- text content
- text style
- fill / stroke
- radius
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
- `style.fill`
- `style.stroke`
- `style.radius`
- `style.text`

## Why this matters

Without Unified UI Model, code parsing and Figma parsing remain two different worlds.

With it, the agent can:

- normalize code into one tree
- normalize Figma into one tree
- diff trees by `uiId`
- update only the fields that matter for sync
