# Visual guardrails

## Purpose

The rendered visual layer must stay safe and controllable.

It should not silently render authenticated pages, capture private user data, treat runtime state as a stable baseline, or auto-patch risky dynamic UI regions.

## Rules

### Auth-gated pages

Pages that look like login/authenticated surfaces are blocked unless explicitly allowed with:

- `guardrails.allowAuthenticatedPages = true`

### Private data

Rendered capture should not keep private user data by default.

By default:

- private inputs are detected
- sensitive nodes are redacted
- those nodes are marked `needsReview`

### Runtime baseline

Runtime/dynamic state is not treated as a trusted baseline unless explicitly allowed.

By default dynamic stateful nodes are marked with:

- `runtimeBaseline = untrusted`

### Auto patch restrictions

Dynamic stateful blocks are not auto-patched.

### Limited regions

The rendered layer explicitly limits:

- infinite scroll
- animated regions
- carousels
- canvas
- webgl

These regions are flagged and should route to review instead of blind automation.

## Effect on confidence

Guardrail findings lower visual confidence and can force:

- `needsReview = true`
- no auto patch
- no complex auto-created Figma elements
