# Render-first roadmap toward Divriots-grade fidelity with reverse sync preserved

## Goal

Reach a Divriots-like quality bar for website → Figma transfer while preserving our reverse-sync contract (Figma → code) and stable `uiId` mapping.

This means:

- better typography fidelity
- stronger layout/container normalization
- stable icon and wrapper preservation
- no duplicate synthetic trees across live imports
- no loss of reverse-sync addressability

## Non-goals

- do not replace render-first with AST-first
- do not sacrifice `uiId` stability for pretty naming only
- do not hardcode fixes to a single page/template when a reusable rule is possible

## Working principles

1. Render-first remains the source of visual truth.
2. Semantic normalization happens after extraction, not instead of extraction.
3. Stable sync identity is preserved even when Figma-facing names become more semantic.
4. Layout-affecting wrappers are preserved; only passive wrappers may collapse.
5. Typography must resolve to real Figma font family/style pairs, not only numeric weight.
6. Cleanup must remove the whole synthetic subtree before a new live import.
7. Every fix must be covered by regression tests and, when relevant, live verification.

## Workstreams

### 1. Synthetic subtree lifecycle and duplicate prevention

Problems:

- old synthetic nodes can survive between imports
- cleanup currently deletes too little
- duplicate uiIds can accumulate in the live document

Tasks:

- make cleanup delete the full synthetic subtree, not only the nearest root
- add targeted tests for `delete_matching_nodes` and cleanup batching
- add post-import verification for duplicate synthetic uiIds in snapshot exports
- ensure runtime ordering is safe for deep child-first deletion

### 2. Typography fidelity

Problems:

- `fontWeight` is not always converted into the correct Figma `fontStyle`
- headings/body labels may fall back to `Regular`
- synthetic labels must inherit full text style

Tasks:

- finish runtime font resolution mapping (`Regular/Medium/Semibold/Bold/Black`)
- add tests against live/runtime font selection behavior
- ensure synthetic labels inherit family, style, weight, size, line-height, alignment, fill
- verify exported snapshot reports the intended font family/style pairs

### 3. Semantic normalization layer

Problems:

- node names are still too class-string-centric
- imported trees are structurally correct more often now, but not normalized like Divriots

Tasks:

- introduce semantic Figma-facing naming for major block roles (`Header`, `Main`, `Footer`, `Section`, `Container`, `Card`, `Text`, `Icon`)
- keep stable `uiId` unchanged for reverse sync
- add a normalization step that improves names without changing sync identity
- cover with tests to prove reverse-sync lookup still uses `uiId`, not display name

### 4. Layout wrapper preservation

Problems:

- some flex/grid/flex-wrap wrappers still collapse incorrectly
- icon-holder frames and decorative wrappers may disappear
- centered text stacks and CTA/icon rows need predictable wrapper retention

Tasks:

- formalize wrapper categories: `layout-critical`, `visual`, `passive`
- preserve all `layout-critical` wrappers in planning
- add regressions for icon holders (`48x48`, `64x64`, circles, rounded boxes)
- add regressions for `flex-wrap`, centered text stacks, grid item stacks

### 5. Grid and multi-card sections

Problems:

- grid wrappers are improved, but item-level hierarchy still needs broader hardening
- repeated cards should preserve editable hierarchy and spacing

Tasks:

- generalize grid reconstruction for repeated card sections
- preserve item wrappers and internal vertical stacks
- minimize absolute child positioning inside reconstructed grids
- add real-page regressions for feature cards and “How it works” style sections

### 6. Reverse sync preservation

Problems:

- better semantic normalization must not break Figma → code mapping
- wrapper preservation changes the tree depth

Tasks:

- ensure reverse-sync maps by stable `uiId`
- add tests for `figma-to-code` and `reconcile` with normalized names and preserved wrappers
- verify code patch selection still targets original source nodes

### 7. Live validation loop

Tasks:

- use active plugin sessions to validate each major step
- compare our snapshot structure against the Divriots reference tree in the same file
- explicitly track:
  - duplicate uiIds
n  - font family/style accuracy
  - wrapper preservation
  - alignment/layout hierarchy

## Execution order

1. finish subtree cleanup / dedup runtime
2. finish typography runtime mapping and verification
3. add semantic normalization layer with reverse-sync safety
4. harden wrapper preservation for icon holders / flex-wrap / grid items
5. expand reverse-sync regression coverage for normalized trees
6. run final live comparison against Divriots reference page

## Acceptance criteria

- live import does not create duplicate synthetic uiIds
- repeated imports stay stable
- headings/body/CTA labels use the correct font family/style in snapshot export
- icon-holder wrappers are preserved as frames
- grid and flex-wrap sections preserve item hierarchy
- reverse sync tests stay green
- reference comparison against Divriots shows comparable section/container/text hierarchy quality
