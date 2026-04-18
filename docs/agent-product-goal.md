# Agent product goal and target operating model

## Purpose

This document defines the intended end-state of `figma-gateway` as a product and as an execution substrate for autonomous agents.

It is not only a planning note.

It is the reference goal that all architectural and implementation decisions should converge toward.

## Desired user experience

The user should be able to say things like:

- "перенеси макет в фигму по этому адресу"
- "поправь блок hero, сделай кнопку меньше и фон светлее"
- "поправь блок settings согласно макету в Figma"
- "я изменил блок в Figma, синхронизируй это в код"

The agent should then complete the task without asking orchestration questions about how to navigate the project internals.

The user provides intent and target context.
The system should resolve the rest.

## End-state behavior

### 1. URL or project -> beauty Figma

Given a live URL or project path, the agent should:

1. open the real UI surface
2. resolve the correct render surface (`document`, `app_shell`, `auth_gated_spa`, `component`)
3. extract real visual truth from browser render
4. plan an editable Figma-native tree
5. preserve stable reverse-sync identity
6. create a visually strong mockup in Figma without degrading to a screenshot-first transfer

The expected result is a beauty Figma mockup with:

- clean section/container hierarchy
- usable Auto Layout structure
- preserved wrapper semantics where they affect layout
- strong typography fidelity
- icon/asset/effect fidelity as far as confidence allows
- stable block identity for future edits

### 2. Natural-language block edit -> code change

Given a command like:

- "change block X"
- "make block X more compact"
- "update block X styling"

The agent should:

1. resolve the user intent to a stable block identity
2. find the code owner for that block
3. decide whether the requested change is code-side, Figma-side or reconcile-mode
4. apply the safe code change through the code-editing MCP
5. preserve reverse-sync compatibility with Figma and mapping registry

### 3. Figma edit -> code change

If the user edits the block in Figma and asks the agent to sync the code, the agent should:

1. read the changed Figma node
2. resolve the same block in mapping registry
3. compare Figma state, rendered state, code AST state and last synced state
4. generate a safe code patch plan
5. apply the patch through the code-editing MCP
6. preserve stable block identity and sync history

## Product definition

`figma-gateway` is not just a Figma importer.

It is a bidirectional orchestration layer between:

- live rendered UI
- code ownership and patchability
- Figma editing structure
- design tokens and semantic design intent
- autonomous agent commands

Its purpose is to let an agent move safely and repeatedly between those representations.

## Source-of-truth model

The target system must reason through explicit responsibilities:

- Code AST -> structural truth and safe patch ownership
- Rendered UI -> visual truth
- Design tokens -> semantic design intent
- Figma -> editable design target and design-side delta source
- Mapping registry -> durable cross-runtime identity memory

No single representation is sufficient on its own.

## Core product promise

The system must eventually support the following loop:

1. bootstrap from URL or code
2. create high-fidelity Figma structure
3. preserve block identity
4. accept future edits from text intent, code or Figma
5. route those edits to the correct execution surface
6. keep the system reversible and deterministic

This is the actual product promise.

## Operating model for agents

Agents working on this codebase should optimize for the following operating model:

### Intent-first

The user speaks in terms of blocks, pages and desired changes.

The system should translate that into:

- target block identity
- active source of truth
- execution mode
- safe patch plan

### Identity-first

Every important visual block should become a durable addressable object.

The long-term target is not merely a DOM node or a Figma frame.

The target is a stable block identity with:

- block id
- stable `uiId` or compatible alias set
- code ownership
- Figma ownership
- render surface context
- sync history

### Render-first for visual decisions

Agents must not make visual claims from AST alone.

All high-confidence visual decisions should route through the rendered layer.

### Planner-first for Figma output

Figma output should come from an explicit composition planner, not from accidental raw DOM mirroring.

### Reconcile-first for reverse sync

When code and Figma may both have changed, the system should reason through reconcile mode instead of blindly choosing the most recent surface.

## Required capabilities for the target state

### A. Surface-aware extraction

The system must understand:

- `component`
- `document`
- `app_shell`
- `auth_gated_spa`

and select the correct content surface inside shell-like applications.

### B. Stable block identity

The system must evolve from raw node identity toward block identity.

Stable `uiId` remains critical, but it is not the whole abstraction.

### C. Beauty Figma planning

The system must produce Figma-native structure that is both:

- visually faithful
- editable for future operations

### D. Code-safe mutation

All code-side mutation must remain constrained by:

- AST ownership
- source mapping
- confidence
- conflict rules

### E. Figma-to-code translation

Figma changes must be interpretable as safe code-side deltas where possible.

### F. Durable sync memory

The system must remember prior correspondences instead of rematching every task from scratch.

## Non-goals even in the target state

The long-term product still does not require:

- pretending to support arbitrary frameworks equally well without confidence metadata
- claiming reliable round-trip for canvas/WebGL-heavy UI
- fabricating semantic token mappings where none exist
- destructive mutation from unstable identity
- screenshot-only transfer marketed as editable design reconstruction

## Decision rule for contributors and agents

When multiple implementation directions are possible, prefer the one that better supports this future user story:

> A user can point the agent at a live project or design, ask for a transfer or edit in natural language, and the system can find the correct block, understand the correct source of truth, apply the right kind of change, and preserve future reversibility.

If a local optimization harms that future, it is the wrong optimization.
