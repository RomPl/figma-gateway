# Rendered layer token resolution

## Purpose

Rendered UI should not synchronize only raw computed values.

It should attempt to normalize those values back into design-system tokens.

## Main rule

For rendered nodes, token resolution starts from computed values and produces semantic token bindings.

The goal is to sync:

- `color.brand.primary`

instead of:

- `#265fe0`

## Supported token categories

The rendered layer attempts to resolve:

- color tokens
- spacing tokens
- radius tokens
- typography tokens
- shadow tokens
- breakpoint tokens

## Stored binding data

For each matched token, the rendered layer stores:

- `raw value`
- `matched token`
- `confidence`

It also preserves mapping references for both:

- code-side mapping
- Figma-side mapping

## Resolution strategy

Priority order:

1. exact code-side hint when present
2. exact figma-side hint when present
3. exact raw/computed value match
4. numeric nearest-match heuristic within type-specific tolerance

## Binding location

Token matches are written into:

- `semanticTokens`
- `meta.tokenBindings`

`meta.tokenBindings` includes:

- raw value
- matched token
- confidence
- css variable
- code class name
- figma variable id / style id
- mapping sources

## Outcome

With this layer, rendered sync can preserve design intent instead of replaying only raw browser output.
