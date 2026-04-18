# Canonical agent flow

## Purpose

The agent should not improvise.

It should follow one deterministic operational loop when working with UI synchronization, planning and reconciliation.

This document defines the canonical flow for the visual-sync agent and aligns it with the product goal described in [agent-product-goal.md](./agent-product-goal.md).

## Runtime boundary for the agent

The agent should treat the runtime surfaces as intentionally split:

- `figma-gateway.vazovski.art` -> Figma and rendered-UI side operations
- `mcp.vazovski.art` -> code-side operations

Operational consequence:

- extraction, Figma planning, Figma reads/writes, mapping and reconcile classification happen through `figma-gateway`
- actual code mutation happens through the separate code MCP

The agent may move between these surfaces inside one user task, but it should not confuse their responsibilities.

## Primary product situations this flow must support

The same canonical loop should work for all three high-level situations:

1. URL or code -> Figma reconstruction
2. natural-language request -> code or Figma mutation
3. Figma mutation -> code mutation

The loop may enter at different starting points, but the resolution logic should be the same.

## Canonical flow

### 1. Resolve the target block or surface

The agent starts from an explicit target when possible:

- selector
- `uiId`
- Figma node reference
- code selector
- page or route surface
- natural-language block description

If the target is not already a stable `uiId`, the agent should first resolve it through:

- selector resolution
- mapping lookup
- surface context
- semantic block matching

Primary mechanisms:

- `selectorResolverService.resolve(...)`
- mapping registry lookup
- route/surface metadata

Goal of this step:

- obtain the most stable possible block identity
- reduce free-form targeting before any diff or planning begins

### 2. Resolve the active execution mode

Before loading sources, the agent should classify the task itself.

Typical modes:

- `code_to_figma`
- `figma_to_code`
- `reconcile`
- `rendered_extract_only`
- `token_apply`
- `mapping_rebind`

Goal of this step:

- decide which source can be authoritative for the requested operation
- prevent blind execution on the wrong surface

### 3. Resolve the active render surface

The agent must understand what kind of runtime surface it is dealing with:

- `component`
- `document`
- `app_shell`
- `auth_gated_spa`

If the surface is shell-like, the agent should prefer the content work surface over the persistent outer shell.

Operational rule:

- do not plan or diff the whole shell when the user intent concerns the content block inside it

### 4. Get the AST node

Once the target block is known, the agent retrieves the code-side node.

Primary source:

- `CodeUiParserService`

Meaning of the AST node:

- structural truth
- source mapping
- patch ownership
- semantic structure
- fallback values when visual data is missing

The AST node is **not** the primary source of visual truth.

### 5. Get the rendered node

The agent then retrieves the rendered node from the browser-rendered UI snapshot.

Primary source:

- `RenderedUiExtractorService`
- `RenderedToCodeMapperService`

Meaning of the rendered node:

- visual truth
- computed layout
- computed typography
- computed styles
- actual images/icons/assets
- responsive state by breakpoint
- surface metadata such as shell/content selection

If available, rendered node should be treated as the primary visual source for sync.

### 6. Get the Figma node

The agent then retrieves the design-side node.

Primary source:

- `FigmaUiExtractorService`
- plugin bridge state
- mapping registry

Meaning of the Figma node:

- design editing target
- editable design-side structure
- design-side delta source when the user says "make code match Figma"

### 7. Resolve tokens

After the three source nodes are available, the agent resolves semantic token bindings.

Primary source:

- `DesignTokenService`
- rendered token bindings
- code-side token hints
- figma-side token hints

Meaning of this step:

- normalize raw values into semantic system decisions
- prefer `color.brand.primary` over `#265fe0`
- prefer spacing/radius/typography/shadow/breakpoint tokens where possible

### 8. Load mapping and last sync memory

The agent should then retrieve mapping and prior sync state.

Primary source:

- mapping registry

Meaning of this step:

- reopen prior correspondences safely
- avoid re-matching from scratch on every task
- compare current state to last synced baseline
- preserve future reversibility

### 9. Diff

The agent compares the relevant states.

Recommended comparison model:

- Code AST state
- Rendered state
- Figma state
- Token-normalized state
- last synced state

Rules:

- structural differences are interpreted through AST
- visual differences are interpreted through rendered DOM
- token differences are interpreted through semantic token bindings
- design editing differences are interpreted through Figma
- prior sync state is used to distinguish fresh deltas from already-accepted baselines

### 10. Build plan

Once the diff is known, the agent builds a plan.

Plan must be deterministic and source-aware.

Typical outputs:

- Code -> Figma execution plan
- Figma -> Code patch plan
- reconcile merge plan
- token application batch
- mapping update plan

Rules:

- only use source mapping from AST when patching code
- only use rendered node as primary visual baseline
- only create complex Figma visual elements when confidence is sufficient
- preserve block identity and future sync addressability
- mark risky or low-confidence regions for review instead of inventing structure

### 11. Apply through the correct runtime

After plan construction, the agent either:

- batches Figma plugin commands
- applies safe code patches through the code-editing MCP
- updates mapping state
- or marks conflicts / `needsReview`

Rules:

- auto-apply only when confidence and guardrails allow it
- otherwise return deterministic review output instead of improvisation

## Source priority model

The agent should follow this source priority model consistently:

- structural truth -> AST
- visual truth -> rendered DOM
- design intent -> tokens
- design editing truth -> Figma
- sync continuity -> mapping registry

## Canonical operational summary

In compact form, the canonical loop is:

1. resolve target identity
2. resolve task mode
3. resolve render surface
4. get AST node
5. get rendered node
6. get Figma node
7. resolve tokens
8. load mapping / last sync state
9. diff
10. build plan
11. apply or mark conflicts

## Fallback behavior

The agent must behave deterministically when one of the expected sources is weak or missing.

### Fallback: no stable `uiId`

If no stable `uiId` exists:

1. try selector resolver
2. try mapping registry aliases
3. try heuristic matching
4. attach explicit lower confidence
5. mark mapping as unstable
6. do not auto-apply destructive code patches from this match

Operational rule:

- missing `uiId` is allowed as a temporary targeting aid
- missing `uiId` is **not** a strong baseline for automatic mutation

### Fallback: no rendered snapshot

If no rendered snapshot is available:

1. continue with AST + Figma only
2. explicitly downgrade visual confidence
3. treat visual values as fallback-only
4. avoid claiming visual fidelity
5. avoid complex render-derived planning decisions

Operational rule:

- when rendered UI is unavailable, the agent may still operate structurally
- but should not pretend that AST declarations equal real visual truth

### Fallback: unresolved shell/content boundary

If a shell-like app surface exists but content root cannot be isolated confidently:

1. keep shell metadata
2. mark the surface as lower-confidence
3. avoid broad destructive planning against the full shell
4. prefer a narrower block-level target if possible

Operational rule:

- shell ambiguity is acceptable for diagnosis
- shell ambiguity is not acceptable for large automatic rewrites

### Fallback: asset is unresolvable

If an image/icon/background asset cannot be resolved:

1. keep metadata for the unresolved asset
2. register placeholder strategy where applicable
3. avoid inventing image contents
4. avoid destructive asset-ref rewrites in code
5. prefer `needsReview` over guessing

Operational rule:

- unresolved assets may still participate in layout diff
- but should not be treated as confidently replaceable asset references

### Fallback: token not found

If no semantic token can be found:

1. preserve raw value
2. keep token confidence low
3. do not fabricate a semantic token name
4. continue with raw visual value if required
5. mark the node as lower-confidence if tokenization is important for the task

Operational rule:

- missing token resolution is acceptable
- fabricated token resolution is not acceptable

### Fallback: source mapping is incomplete

If source mapping is partial or incomplete:

1. allow diagnosis
2. allow reconcile classification
3. allow Figma planning for rendered-only cases
4. block unsafe code patching
5. preserve evidence for later remapping

Operational rule:

- incomplete source mapping still supports diagnosis and some Figma flows
- incomplete source mapping is not a safe basis for code mutation

## Guardrails

At every step, the agent should respect visual confidence and guardrails.

The goal is to avoid:

- hallucinated sync
- invented token mapping
- invented asset mapping
- destructive mutation from unstable identity
- false claims about visual fidelity

## Why this canonical flow matters

Without a canonical flow, the agent will overuse whichever source is easiest in the moment.

That leads to:

- AST-first visual mistakes
- Figma-first code patches without ownership guarantees
- shell-wide planning when only a content block should change
- unstable re-matching across repeated tasks

This loop is what makes the agent deterministic instead of improvisational.
