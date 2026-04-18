# Roadmap

## Product north star

The north star is not merely "import a page into Figma".

The north star is:

- user points the agent at a project or URL
- agent reconstructs a beauty Figma mockup
- stable reverse-sync identity is preserved
- user can later ask to change a block in natural language
- agent can patch code safely through the code MCP
- user can also change the block in Figma and ask the agent to sync code back
- the whole loop remains deterministic and reversible

See [agent-product-goal.md](./agent-product-goal.md).

## Current implementation status

Recently completed foundational work:

- mode-based surface resolution instead of framework-specific profiling
- surface-aware planning context propagated through extractor and downstream pipelines
- block identity scaffold and alias-aware resolution
- breakpoint families and variant-set contract (`desktop` / `tablet` / `mobile`)
- multi-breakpoint rendered-first and code-backed planning routes
- breakpoint-aware intent, diagnostics and reconcile orchestration
- derived variant-group registry surface without breaking authoritative `uiId` bindings

This means the project now has a real runtime foundation for future multi-breakpoint beauty planning and reverse-sync evolution.

## Foundation phases

### Phase 1

- finish the backend service skeleton
- maintain CI checks for build and typing
- keep runtime/deploy strategy stable

### Phase 2

- maintain explicit HTTP contracts and health probes
- preserve integration coverage for API and pipelines
- keep plugin bridge and write runtime stable

### Phase 3

- preserve Figma read/write orchestration
- preserve MCP transport boundaries
- preserve authn/authz and operational safety

## Current architecture shift

- treat `Rendered UI Snapshot` as an explicit source-of-truth layer
- fix that visual sync depends primarily on browser render
- split responsibilities between `Code AST`, `Rendered DOM`, `Design Tokens`, `Figma Snapshot` and mapping registry
- move from AST-first assumptions toward render-first visual architecture
- move from framework-specific assumptions toward mode-based surface understanding

## Strategic workstreams toward the target product

### 1. Surface-aware universalization

Goal:

Make the system reason about runtime surfaces rather than framework names.

Tasks:

- finish mode-based `RenderProfileResolver` / `SurfaceModeResolver`
- propagate shell/content surface metadata into planning and reconcile
- complete root/app-shell logic for authenticated SPA surfaces

### 2. Block identity system

Goal:

Move from raw node identity toward first-class block identity while preserving `uiId` compatibility.

Tasks:

- define block identity above raw DOM path or Figma frame name
- support aliases from selector, uiId, mapping and semantic role
- persist block identity through mapping registry

### 3. Beauty Figma planning

Goal:

Produce editable Figma-native output that is visually strong enough for real design work.

Tasks:

- improve hierarchy normalization
- improve Auto Layout composition
- improve typography fidelity
- improve SVG geometry fidelity
- improve export snapshot fidelity for effects and assets
- preserve layout-critical wrappers

### 4. Code-safe execution

Goal:

Allow an agent to modify blocks in code from natural-language intent while preserving ownership and reversibility.

Tasks:

- classify requested edits into safe code mutation classes
- route code mutations through AST ownership and code MCP
- persist post-change mapping and sync state

### 5. Figma-to-code execution

Goal:

Allow a user to edit a block in Figma and then instruct the agent to update code accordingly.

Tasks:

- strengthen Figma -> code diff interpretation
- classify which Figma deltas are safe to translate into code
- keep reconcile and mapping registry as the control surface

### 6. Reconcile and conflict policy

Goal:

When code and Figma both changed, make conflict resolution explicit and deterministic.

Tasks:

- improve last-sync memory usage
- separate code-authoritative, render-authoritative and Figma-authoritative fields
- return review states instead of guessing across ambiguous deltas

## Priority order

1. finish surface-aware extraction and shell/content operationalization
2. introduce stronger block identity and mapping memory
3. improve beauty Figma planner fidelity
4. expand code-safe mutation flow through code MCP
5. expand Figma-to-code translation and reconcile safety
6. harden repeated real-project live loops

## Success condition

The roadmap succeeds when a future agent can reliably perform this loop:

1. reconstruct the live UI in Figma from URL or project path
2. preserve future reverse-sync compatibility
3. accept a user request to edit a block by description
4. apply that change on the right surface
5. repeat the process after manual Figma edits without losing identity
