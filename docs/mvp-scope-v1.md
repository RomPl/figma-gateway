# MVP scope v1

**Document type:** roadmap

## Goal

The first working version must stay intentionally narrow.

This version is the smallest reliable slice that allows an agent to:

- understand simple React UI
- create a Figma mockup for that UI
- synchronize simple visual changes back into code

## Supported in v1

### Code stack

- React
- TypeScript

### UI surface

- basic layout components
- text
- buttons
- images
- sections
- frames
- groups

### Visual properties

- colors
- typography
- spacing
- border radius
- auto layout

## Explicitly not in v1

- complex business logic
- animations
- complex canvas/WebGL UI
- full round-trip for arbitrary technologies

## Important interpretation

The project now contains real groundwork for:

- breakpoint families (`desktop` / `tablet` / `mobile`)
- variant-set metadata
- multi-breakpoint planning and diagnostics scaffolding

That does **not** mean the system should claim full responsive parity or full multi-breakpoint reverse sync as a mature product capability yet.

## Practical interpretation

### Agent can do

- read React + TypeScript UI structure
- map stable UI blocks through `data-ui-id` and Figma plugin data
- build basic Figma structures from code intent
- change text, colors, spacing, radius, layout primitives
- use breakpoint-aware planning scaffolding where the route/pipeline supports it
- sync targeted presentational edits back to code

### Agent should not claim

- full application behavior understanding
- safe editing of arbitrary framework stacks
- complete responsive parity for every viewport in one pass
- universal support for animation-heavy or canvas-heavy UIs
- finalized durable reverse-sync bindings for all multi-breakpoint variants

## Why this restriction exists

The project already has:

- low-level Figma write runtime
- stable `uiId` bridge between code and Figma
- registry/API for block identity
- multi-breakpoint groundwork

What it still needs for a trustworthy first release is narrow operational scope.

That scope boundary is part of the product contract, not just a planning note.
