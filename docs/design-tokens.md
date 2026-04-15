# Design tokens as shared source of truth

## Purpose

Universal sync becomes fragile when the system only sees raw visual values.

This layer makes the agent synchronize design decisions instead of just pixels.

Examples:

- `color.brand.primary`
- `space.24`
- `radius.lg`
- `text.h1`

## Supported categories

- colors
- spacing
- typography
- radius
- shadows
- breakpoints

## Storage model

Backend SQLite table:

- `design_tokens`

Each record can bind together:

- token name
- token category
- raw value
- CSS variable
- Tailwind utility
- code references
- Figma variable/style references
- tags and metadata

## Code-side mapping

The registry can store code references such as:

- file
- export name
- selector
- class name
- style path
- CSS variable
- token source

Examples:

- `--color-brand-primary`
- `bg-brand-primary`
- `text-h1`
- `rounded-lg`

## Figma-side mapping

The registry can store Figma references such as:

- file key
- variable collection id
- variable id
- style id
- variable/style name
- mode

This lets the agent connect project tokens to Figma variables/styles.

## API

- `POST /api/design-tokens`
- `GET /api/design-tokens`
- `GET /api/design-tokens/:token`
- `POST /api/resolve-design-token`
- `POST /api/search/design-tokens`

## Shared truth behavior

The registry also supports lookup by practical hints from either side:

### Code hints

- raw value
- class name
- CSS variable

### Figma hints

- variable id
- style id
- raw value

This gives the system a token mapping layer between code and Figma.

## Why this matters

With tokens, the agent starts syncing:

- semantic color choices
- spacing scale decisions
- typography hierarchy
- radius system
- shadow system
- breakpoint system

instead of only hardcoded visual values.
