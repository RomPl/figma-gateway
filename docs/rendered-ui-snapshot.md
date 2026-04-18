# Rendered UI snapshot

**Document type:** reference

## Purpose

Rendered UI Snapshot is the visual-truth layer for synchronization.

It describes how the interface actually looks after real browser rendering, not just how it is written in JSX and not just how it exists in Figma.

## Main rule

Visual sync must rely on rendered DOM and computed browser styles first, not only on AST.

## Source-of-truth position

The current architecture relies on five coordinated sources:

1. **Code AST** — source mapping, patch ownership, structural fallback
2. **Rendered DOM/CSS snapshot** — visual truth
3. **Design tokens** — semantic design intent
4. **Figma snapshot** — editable design target
5. **Mapping registry** — durable sync memory across runs and directions

Rendered UI Snapshot is the source that answers:

> what is actually drawn in the browser right now?

## Why AST is not enough

AST can describe declarations, but it cannot fully explain:

- computed CSS
- inherited typography
- cascade effects
- responsive changes
- hidden or clipped content
- actual dimensions after layout
- background assets
- icon rendering details
- overflow and positioning side effects
- browser-resolved visibility and display behavior

AST remains necessary for mapping and safe patching.

It is not the primary source of visual truth.

## Sync implication

For visual sync modes, rendered snapshot is the first-class baseline for:

- code -> Figma
- Figma -> code
- reconcile
- rendered token mapping
- breakpoint-aware comparison

## Non-goals

Rendered UI Snapshot must not become a reason to mutate business logic or trust unstable private runtime state.

It must not be treated as a permission to:

- modify hooks
- modify API calls
- depend on uncontrolled private runtime data
- freeze arbitrary transient state as the canonical baseline

## Outcome

The compact rule for agents is:

- **visual truth** comes from browser render
- **patch location** comes from AST
- **design target** comes from Figma
- **sync continuity** comes from mapping registry
