# Observed Design System

## Goal

The gateway can now create a site design-system sidecar next to an imported Figma mockup.

This is an "observed" design system, not a manually curated brand system yet.
It is extracted from browser-rendered truth and records evidence for every suggested token.

## Why observed first

A live site often contains real brand values, legacy values, one-off styles and noise.
The first pass should therefore preserve evidence and confidence instead of pretending that every value is canonical.

The intended evolution is:

1. rendered UI -> observed design system
2. observed design system -> editable Figma sidecar
3. human/GPT review -> curated design system
4. curated system -> future screen generation, Figma -> Code reconcile and code patch planning

## Extraction inputs

Input is a `UiModelDocument` produced from rendered browser capture.

The extractor reads:

- colors from text, backgrounds, borders and icons
- typography from rendered text/button nodes
- spacing from gap, row-gap, column-gap, padding and margins
- radius from border-radius
- shadows from box-shadow
- component specimens from buttons, inputs and cards

## Output document

The core document version is:

```text
observed-design-system.v1
```

Each token contains:

- `id`
- `name`
- `kind`
- `value`
- `count`
- `confidence`
- `evidence[]`

Evidence contains `uiId`, node kind/name and usage. This is required for reverse-sync and reconcile.

## Figma sidecar

The Figma planner creates a sidecar frame named:

```text
Site Design System · <site-or-title>
```

Sections:

- `01 Colors`
- `02 Typography`
- `03 Components / Buttons / Inputs`
- `04 Spacing`
- `05 Radius`

All sections are normal editable Figma frames/text layers.

## Plugin data

The sidecar root stores:

```text
figma-gateway:design-system-document
```

Each specimen stores:

```text
figma-gateway:design-system-token
```

This keeps the Figma artifact machine-readable for later Figma -> Code or Figma -> Design-System reconcile.

## API

Extract only:

```http
POST /api/design-system/extract
```

This accepts the same rendered target payload as `/api/rendered-ui/extract` plus:

- `title`
- `maxItemsPerSection`
- `includeFigmaCommands`
- optional sidecar `x` / `y`

Import page and create the sidecar in the same Figma batch:

```http
POST /api/rendered-ui/import-to-figma
```

with:

```json
{
  "includeDesignSystem": true,
  "designSystemTitle": "parts.avtopribor.ru",
  "designSystemMaxItemsPerSection": 24
}
```

## Current implementation level

MVP uses editable documentation frames and plugin data first.

Full Figma Variables/Text Styles/Paint Styles should be added later after observed-token naming and curation flows are stable.
Figma's Plugin API supports file write access and variables, but the product should not create noisy permanent variables until the observed tokens are reviewed.

## Agent rule

When working toward Claude Design-like behavior, use the observed design system as brand/context memory:

- generate new screens from curated or high-confidence observed tokens
- ask for clarification when token confidence is low
- use evidence links to explain why a token exists
- do not overwrite code tokens from one-off observed values without review

## Wider universal coverage

Observed design-system extraction now covers more than basic brand primitives:

- borders
- assets
- icons
- layout patterns
- interactive states
- audit / needs-review clusters

This keeps the sidecar useful for real production sites where design language is distributed across imagery, SVG/icon systems, repeated layout structures, card grids, form controls and low-confidence import fallbacks.

## Source-node token bindings

When the sidecar is generated as part of a Figma import, the planner also writes token bindings back onto the original mockup nodes.

Each source node with token evidence receives:

```text
figma-gateway:design-system-bindings
```

The value is JSON:

```json
{
  "version": "design-system-bindings.v1",
  "uiId": "...",
  "bindings": [
    {
      "tokenId": "color...",
      "tokenName": "color...",
      "kind": "color",
      "usage": "background",
      "confidence": 0.86
    }
  ]
}
```

This is the missing link for bidirectional usage: a later Figma -> Code handoff can inspect a changed node and understand which observed tokens it was originally associated with.

## Figma snapshot command

The plugin runtime exposes:

```text
export_design_system_snapshot
```

It finds the design-system sidecar by `nodeId`, exact `uiId`, `uiIdPrefix` or `Site Design System` name prefix and returns:

- root sidecar identity
- full observed `design-system-document`
- token specimen records from `figma-gateway:design-system-token`
- source node binding records from `figma-gateway:design-system-bindings`

This command is intended for GPT orchestration and future `mcp.vazovski.art` handoff. It gives the code side a machine-readable contract instead of relying on visual inspection of the Figma page.

## Current curation boundary

The system still treats observed tokens as suggestions. It does not yet promote them to permanent Figma Variables or repository design tokens automatically. The next product step is a curated design-system pass that can accept, rename, merge or reject observed tokens before code changes are generated.

## MVP1 completion scope

MVP1 is considered complete when the system can:

1. extract an observed design system from rendered browser truth
2. create an editable Figma sidecar next to the imported mockup
3. write token bindings back onto source mockup nodes
4. read the sidecar and bindings back from Figma through `export_design_system_snapshot`
5. represent standard button states as editable Figma state sets

Button state sets include:

- `default`
- `hover`
- `active`
- `focus`
- `disabled`
- `visited`

These states are stored with plugin data:

- `figma-gateway:button-state-set`
- `figma-gateway:button-state`

They are not treated as final application behavior by themselves. They are design-system evidence and handoff material for a later code patch via `mcp.vazovski.art`.

## MVP1.1: quality and code-handoff contract

The observed design-system document now includes:

```text
designSystem.quality
designSystem.handoff
```

`quality` contains:

- numeric score
- grade: `excellent`, `good`, `needs_curation`, `risky`
- issues
- recommended next steps

`handoff` contains a machine-readable `design-system-handoff.v1` contract for GPT orchestration and `mcp.vazovski.art`.

Important handoff flags:

- `safeForGeneration`
- `safeForCodePatch`
- `requiresCuration`

The rule is conservative: observed design systems can guide generation earlier than they can safely drive code patches. Code patches should wait until high-risk audit/interaction items are reviewed.

The Figma sidecar also stores:

```text
figma-gateway:design-system-handoff
```

on the `Quality / Handoff Contract` section so the handoff contract can be read back from Figma.

## MVP1.2: interactive audit only

MVP1.2 intentionally does not click, hover, submit forms, move carousels or mutate the live site.

It performs read-only detection of behavior risks from already captured rendered metadata:

- `overflow-x/overflow-y`
- children exceeding container bounds
- carousel/swiper/slick class and guardrail signals
- animated-region guardrails
- dropdown/menu/expanded signals
- tabs/accordion class and role signals
- sticky/fixed positioning
- canvas/video/runtime-owned regions

Detected behavior patterns are stored as observed tokens with kind:

```text
interaction
```

and source nodes receive:

```text
figma-gateway:interactive-pattern
```

The sidecar section is:

```text
11 Interactive / Behavior Audit
```

This gives GPT and future code handoff enough context to avoid claiming full behavior fidelity while still preserving important product behavior signals.
