# Execution plan: surface-aware planning context

## Purpose

This document tracks the current implementation phase after the product goal was fixed in the docs.

It should be updated when a major implementation chunk is completed.

## Current phase

Phase E: strengthen breakpoint variant-set contracts so future `desktop` / `tablet` / `mobile` Figma planning can stay reversible and identity-safe.

## Completed phase

Phase A completed:

- introduced a first-class `planning-context` layer
- attached planning context during rendered extraction
- propagated planning context into code-to-figma, figma-to-code and reconcile flows
- normalized breakpoint family metadata (`desktop` / `tablet` / `mobile`) even while MVP still runs one active breakpoint per execution

## Why this phase comes first

Before beauty-planning or richer reverse sync can be trusted, the system must stop losing runtime intent between extraction and planning.

Today the extractor already knows important facts such as:

- surface mode
- shell/content distinction
- breakpoint name
- viewport dimensions
- authenticated-shell characteristics

But downstream pipeline behavior is still too implicit.

A dedicated planning context is the smallest useful architectural step that improves correctness without forcing a broad rewrite.

## Scope of this phase

### 1. Introduce a first-class planning context

The planning context should carry at least:

- surface mode
- root strategy
- authenticated flag
- shell/content selection metadata
- breakpoint metadata
- normalized breakpoint group (`desktop` / `tablet` / `mobile`)

### 2. Attach planning context at extraction time

Rendered extraction should persist this context in the UI model so later stages do not need to reconstruct it heuristically.

### 3. Propagate planning context into downstream pipelines

At minimum:

- code-to-figma
- rendered-first import
- figma-to-code
- reconcile

should all be able to read the same planning context from the rendered model.

### 4. Start using it operationally

Even before full beauty-planner work, downstream systems should at least:

- understand when the extracted root is a shell-like app surface
- understand which breakpoint family is active
- keep shell/content decisions visible in notes, planner metadata and reconcile outputs

## Not part of this phase

This phase does not yet require:

- full block identity implementation
- full multi-breakpoint planning
- full shell-region exclusion in every diff path
- final beauty-planner normalization
- final SVG/effects fidelity work

## Breakpoint strategy to preserve for future work

The implementation should already assume that one logical block may later have multiple visual states across breakpoint families.

Future primary families:

- `desktop`
- `tablet`
- `mobile`

Current MVP behavior remains single active breakpoint per extraction/planning run.

Multi-breakpoint planning is explicitly a later phase, but the context model should not block it.

## Next phases after this one

### Phase B

Use planning context operationally in planner and reconcile:

- shell-aware planning
- shell/context exclusion where needed
- breakpoint-aware notes and confidence routing

### Phase C

Introduce stronger block identity above raw DOM node identity while preserving `uiId` compatibility.

### Phase D

Expand beauty Figma planning, SVG fidelity and effects fidelity on top of the stabilized planning context.

## Working target for current implementation loop

Phase B implementation focus:

- make planner output variant-aware metadata for breakpoint families
- attach surface and breakpoint plugin-data to Figma root nodes
- make reconcile reasons explicitly surface-aware and breakpoint-aware
- keep multi-breakpoint support deferred, but preserve the contract for `desktop` / `tablet` / `mobile`

## Completed phase

Phase B completed:

- planner emits variant-aware metadata for breakpoint families
- root Figma plan now carries planning plugin-data for surface mode and breakpoint metadata
- reconcile reasons are now surface-aware and breakpoint-aware
- `desktop` / `tablet` / `mobile` are preserved as first-class breakpoint families while execution remains single-breakpoint per run


## Working target for current implementation loop

Phase C implementation focus:

- add explicit block identity metadata above raw node identity
- keep `uiId` as the primary compatibility key
- expose aliases and semantic fallback names for future selector/intent resolution
- avoid forcing a database migration until the contract is stable

## Completed phase

Phase C completed:

- added explicit `blockIdentity` metadata above raw node identity
- preserved `uiId` as the primary compatibility key
- attached identity aliases and semantic fallback names to extracted/rendered/planned nodes
- avoided schema/database migration while the block identity contract is still stabilizing


## Working target for current implementation loop

Phase D implementation focus:

- make registry and search alias-aware using additive metadata
- improve selector resolution using block identity aliases
- keep `uiId` as the exact reverse-sync key while making intent resolution less brittle

## Completed phase

Phase D completed:

- registry and search are now alias-aware using additive metadata from snapshots and metadata blobs
- selector resolution now uses block identity aliases in addition to `uiId`, role, text and tree-path matching
- current reverse-sync still uses exact `uiId` as the authoritative key
- alias-aware search improves intent/block targeting without forcing a DB migration
