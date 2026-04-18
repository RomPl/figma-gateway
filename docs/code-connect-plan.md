# Code Connect integration plan

**Document type:** planned / partial

## Current status

This document describes a planned Code Connect read-model direction.

It is **not** the main source of truth for current gateway behavior.

Current implementation status:

- a read-only registry module exists: `src/core/code-connect-registry.ts`
- full startup wiring, REST surface and agent integration are not yet the primary stable path

## Why this exists

Figma Code Connect can help bridge design-system components and real production components.

In this repository, the intended gateway responsibility is limited to a read-model:

- read mapping files from the repository
- validate format
- expose design-component ↔ code-component links to later services

The gateway is not intended here to:

- generate code from Code Connect
- write mappings back into Figma
- replace the current `uiId` / mapping-registry based sync model

## Recommended mapping location

- `code-connect/mappings/`

Recommended substructure:

- `code-connect/mappings/react/`
- `code-connect/mappings/html/`
- `code-connect/mappings/ios/`
- `code-connect/mappings/android/`

## Recommended shape

Each file is JSON and may contain one mapping or a small mapping set for one component family.

The registry should keep stable links such as:

- Figma component identity
- repository + path + export name
- prop mapping hints
- tags / owners / status

## Important separation

Code Connect mappings must stay separate from:

- alias registry
- block identity registry
- current `uiId`-based reverse-sync bindings

These are different lifecycles and different abstractions.

## What already exists

Read-only module:

- `src/core/code-connect-registry.ts`

That module already supports:

- reading mapping files from disk
- validating the shape
- building a read-model
- searching by Figma or code-side identifiers

## What would make it a stable feature later

1. add env/config for mapping directories
2. wire the registry into app startup
3. expose read-only REST and/or MCP endpoints
4. add conflict diagnostics and health visibility
5. integrate it into design-context and agent workflows deliberately

Until that happens, treat this document as **planned / partial**, not as the main operational reference.
