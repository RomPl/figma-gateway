# Architecture

## Goal

Backend and plugin-bridge for an agent-operable Figma Gateway where synchronization does not rely only on code and not only on Figma, but on an explicit browser-rendered visual layer plus durable mapping memory.

The target product is documented in [agent-product-goal.md](./agent-product-goal.md).

This architecture exists to make that product possible.

## Current architectural focus

- React + TypeScript UI
- source mapping through code AST
- visual sync through rendered DOM/CSS snapshot
- design intent through design tokens
- design target through Figma snapshot
- safe reverse synchronization of design changes back into code
- agent-oriented orchestration rather than one-off import scripts

## Intentionally out of scope for the first version

- complex business logic understanding
- animations as baseline visual truth
- canvas/WebGL-heavy UI as a reliable round-trip surface
- universal round-trip for arbitrary technologies
- uncontrolled capture of private runtime state

## Product-level architecture principle

`figma-gateway` is not only a Figma importer.

It is a bidirectional orchestration layer between:

- live rendered UI
- code ownership and patchability
- Figma editing structure
- design tokens
- autonomous agent commands

That means the architecture must support three recurring directions:

1. URL/code -> Figma
2. natural-language intent -> code or Figma change
3. Figma -> code

## Sources of truth

The target architecture relies on 5 distinct sources, each with a different responsibility.

### 1. Code AST

Used for:

- source mapping
- finding the block in code
- safe patching
- preserving JSX ownership boundaries
- structural fallback when rendered data is weak

### 2. Rendered DOM/CSS snapshot

Used for:

- visual truth
- actual layout
- computed styles
- real sizes, positions and visibility
- actual icons, images and background assets
- runtime shell/content surface detection

### 3. Design tokens

Used for:

- design intent
- normalization of raw visual values
- linking code-side and figma-side values to shared semantic decisions

### 4. Figma snapshot

Used for:

- design editing target
- editable design-side structure
- design-side delta source for reverse sync

### 5. Mapping registry

Used for:

- durable cross-runtime identity memory
- block reopening without re-matching from scratch
- sync history
- conflict and reconcile baselines

## Priority model

The system should reason in this order:

- structural truth -> Code AST
- visual truth -> Rendered DOM
- design intent -> Tokens
- design editing target -> Figma
- sync memory -> Mapping registry

Main rule:

Visual truth comes from browser render, not from AST declarations alone.

## Layering model

The gateway moves toward an explicit agent-grade visual sync architecture:

1. stable identity and ownership from code or stable uiIds
2. rendered visual fragment tree from browser DOM/CSS
3. segmentation pass that converts raw rendered fragments into visual block boundaries
4. Figma composition planning that converts segmented visual blocks into editable Figma-native structure
5. durable mapping and sync memory for future edits and reconcile
6. code-safe or Figma-safe execution through the correct runtime

## Important compatibility rule

- `uiId` remains the main durable cross-runtime identifier for reverse sync
- newer identity roles such as block identity, visual identity, source identity and figma ref are added in metadata first
- reverse sync must not break because Figma-facing names become more semantic or because the planner produces cleaner trees

## Architectural rule for visual sync

Any trustworthy visual sync must rely on at least these aligned representations:

1. Code AST -> where the block lives and how it may be safely changed
2. Rendered UI snapshot -> how the block actually looks after browser render
3. Figma snapshot -> what exists in the design file
4. Design tokens -> which semantic system choices sit behind the values
5. Mapping registry -> how the same block is durably addressed across tasks and directions

AST is not a sufficient visual baseline.

## Architectural rule for agents

Any agent working through this architecture should be able to move from user intent to execution through these steps:

1. resolve block identity
2. resolve active source of truth
3. obtain the relevant code/render/Figma/tokens state
4. build a deterministic plan
5. execute on the appropriate surface
6. persist mapping and sync memory for the next task

If the architecture makes this impossible, it is incomplete relative to the product goal.

## Main code layers

- `src/index.ts` -> process bootstrap and HTTP server startup
- `src/core` -> lifecycle, middleware, snapshot/pipeline logic, reconcile and patching
- `src/api` -> HTTP routes and orchestration entrypoints
- `src/config` -> environment loading and validation
- `src/utils` -> infrastructure utilities, including logger
- `src/mcp` -> MCP integration surface
- `src/types` -> shared typings and declarations

## Current strategic workstreams

### 1. Surface-aware extraction

The system now moves away from framework-specific runtime assumptions toward mode-based surface resolution:

- `component`
- `document`
- `app_shell`
- `auth_gated_spa`

This is a required foundation for authenticated SPA handling.

### 2. Identity-first mapping

The project already has `uiId` and mapping registry.

The next architectural step is to evolve toward first-class block identity while preserving `uiId` compatibility.

### 3. Beauty Figma planning

The planner must eventually produce editable, visually strong Figma-native output rather than merely a mechanically correct import tree.

### 4. Reverse sync safety

Figma -> code must remain constrained by source mapping, ownership and reconcile rules.

## Principles

- Config only from env
- HTTP layer separated from lifecycle and configuration
- Logging centralized through Pino
- Errors normalized to one JSON format
- Shutdown handles `SIGINT` and `SIGTERM`
- Visual truth determined by real render snapshot, not static parsing alone
- Code patching remains safe and ownership-constrained
- Durable mapping should be preferred over fresh heuristic matching when possible

## Current endpoints

- `GET /health` -> service state and uptime
- `GET /version` -> name, version and environment

## MVP contract

The service should explicitly advertise the scope of the first version through `/capabilities`, so that agents and clients do not assume universal support where it does not yet exist.

## North-star next steps

- use render surface metadata operationally in planning and reconcile
- separate persistent shell context from content work surface in downstream pipelines
- strengthen block identity above raw DOM node identity
- improve beauty Figma planning without sacrificing reverse-sync addressability
- make text intent, code edits and Figma edits converge on one deterministic execution model
