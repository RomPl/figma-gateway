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
