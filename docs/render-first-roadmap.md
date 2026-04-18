# Render-first roadmap toward beauty Figma transfer with reverse sync preserved

## Goal

Reach a Divriots-like quality bar for website -> Figma transfer while preserving our reverse-sync contract (Figma -> code), stable `uiId` compatibility and future block-level editability.

This document is a visual-fidelity roadmap in service of the larger product goal defined in [agent-product-goal.md](./agent-product-goal.md).

The target is not only a prettier import.

The target is an editable beauty mockup that remains usable for future agent-driven code and Figma edits.

## What success means

A successful render-first transfer should produce:

- strong typography fidelity
- clean section/container hierarchy
- correct shell/content surface choice
- stable icon and wrapper preservation
- preserved reverse-sync addressability
- no synthetic duplicate buildup across repeated imports
- Figma-native editability instead of screenshot-like dead layers

## Non-goals

- do not replace render-first with AST-first
- do not sacrifice `uiId` stability for pretty naming only
- do not hardcode fixes to a single page/template when a reusable rule is possible
- do not optimize visual prettiness in ways that break later reverse sync

## Current runtime baseline

The project now already has:

- surface-aware planning context
- shell/content-aware extraction metadata
- block identity scaffold with alias-aware lookup
- explicit breakpoint variant-set metadata
- multi-breakpoint planning and diagnostics scaffolding
- derived variant-group memory surface

This roadmap now focuses on beauty/fidelity improvements on top of that baseline rather than on foundational surface-mode plumbing.

## Working principles

1. Render-first remains the source of visual truth.
2. Semantic normalization happens after extraction, not instead of extraction.
3. Stable sync identity is preserved even when Figma-facing names become more semantic.
4. Layout-affecting wrappers are preserved; only passive wrappers may collapse.
5. Typography must resolve to real Figma font family/style pairs, not only numeric weight.
6. Cleanup must remove the whole synthetic subtree before a new live import.
7. Every fidelity fix should preserve future editability and reverse-sync safety.
8. Every fix should be covered by regression tests and, when relevant, live verification.

## Workstreams

### 1. Surface-aware planning

Problems:

- shell-like apps can still be planned too broadly
- persistent shell and content work surface are not yet used deeply enough in downstream planners

Tasks:

- consume `renderSurface` operationally in planner and reconcile
- keep shell context without planning the whole shell as editable content
- improve content-root selection for authenticated SPA routes

### 2. Synthetic subtree lifecycle and duplicate prevention

Problems:

- old synthetic nodes can survive between imports
- cleanup may still delete too little in some cases
- duplicate synthetic uiIds can accumulate in live documents

Tasks:

- make cleanup delete the full synthetic subtree, not only the nearest root
- add targeted tests for `delete_matching_nodes` and cleanup batching
- add post-import verification for duplicate synthetic uiIds in snapshot exports
- ensure runtime ordering is safe for deep child-first deletion

### 3. Typography fidelity

Problems:

- `fontWeight` is not always converted into the correct Figma `fontStyle`
- headings/body labels may fall back to `Regular`
- synthetic labels must inherit full text style

Tasks:

- finish runtime font resolution mapping (`Regular/Medium/Semibold/Bold/Black`)
- add tests against live/runtime font selection behavior
- ensure synthetic labels inherit family, style, weight, size, line-height, alignment and fill
- verify exported snapshot reports the intended font family/style pairs

### 4. Semantic normalization layer

Problems:

- node names are still too class-string-centric
- imported trees may be structurally correct but not normalized like strong design tools produce

Tasks:

- introduce semantic Figma-facing naming for major block roles (`Header`, `Main`, `Footer`, `Section`, `Container`, `Card`, `Text`, `Icon`)
- keep stable `uiId` unchanged for reverse sync
- add a normalization step that improves names without changing sync identity
- cover with tests to prove reverse-sync lookup still uses `uiId`, not display name

### 5. Layout wrapper preservation

Problems:

- some flex/grid/flex-wrap wrappers still collapse incorrectly
- icon-holder frames and decorative wrappers may disappear
- centered text stacks and CTA/icon rows need predictable wrapper retention

Tasks:

- formalize wrapper categories: `layout-critical`, `visual`, `passive`
- preserve all `layout-critical` wrappers in planning
- add regressions for icon holders (`48x48`, `64x64`, circles, rounded boxes)
- add regressions for `flex-wrap`, centered text stacks and grid item stacks

### 6. Grid and repeated-card sections

Problems:

- repeated cards still need broader hardening
- item-level hierarchy can become flatter than desired

Tasks:

- generalize grid reconstruction for repeated card sections
- preserve item wrappers and internal vertical stacks
- minimize absolute child positioning inside reconstructed grids
- add real-page regressions for feature cards and “How it works” style sections

### 7. Effects and SVG fidelity

Problems:

- SVG geometry can still lose precision
- export snapshots do not yet fully express desired effect fidelity
- effect-heavy layers can degrade into placeholders too early

Tasks:

- finish SVG geometry fidelity improvements
- improve snapshot fidelity for shadow/blur/overlay/effect extraction
- propagate those effects into Figma-native planning where confidence is sufficient
- keep explicit `needsReview` instead of faking unsupported effect stacks

### 8. Reverse sync preservation

Problems:

- better semantic normalization must not break Figma -> code mapping
- wrapper preservation changes tree depth
- beauty-planner changes can accidentally reduce patch addressability

Tasks:

- ensure reverse sync maps by stable `uiId` and mapping memory
- add tests for `figma-to-code` and `reconcile` with normalized names and preserved wrappers
- covered with regressions: reverse-sync logic stays `uiId`-driven even when Figma display names become semantic and wrapper depth changes
- verify code patch selection still targets original source nodes

### 9. Live validation loop

Tasks:

- use active plugin sessions to validate each major step
- compare our snapshot structure against strong reference transfers in the same file when useful
- explicitly track:
  - duplicate uiIds
  - font family/style accuracy
  - wrapper preservation
  - alignment/layout hierarchy
  - shell/content surface correctness
  - reverse-sync survivability after beautification

## Execution order

1. finish surface-aware planning and shell/content operationalization
[x] 2. finish subtree cleanup / dedup runtime
[x] 3. finish typography runtime mapping and verification
[x] 4. add semantic normalization with reverse-sync safety
[x] 5. harden wrapper preservation for icon holders / flex-wrap / grid items
[x] 6. improve SVG and effects fidelity
[x] 7. expand reverse-sync regression coverage for normalized trees
[x] 8. run final live comparison against reference beauty transfers

## Acceptance criteria

[x] live import does not create duplicate synthetic uiIds
[x] repeated imports stay stable
[x] shell-like surfaces target the correct content work surface
[x] headings/body/CTA labels use the correct font family/style in snapshot export
[x] icon-holder wrappers are preserved as frames
[x] grid and flex-wrap sections preserve item hierarchy
[x] SVG geometry and common effects are represented with materially improved fidelity
[x] reverse sync tests stay green after beauty-planner changes
[x] reference comparison shows comparable section/container/text hierarchy quality without losing future code-sync addressability
