# Figma → Code diff and safe patcher

## Goal

This is the execution path for the scenario:

- "sync code with the mockup"

The pipeline reads Figma UI, reads code UI, normalizes both into Unified UI Model, computes visual diff, and produces a safe JSX patch.

## MVP patch scope

Allowed automatic changes:

- text content
- classes / style props
- spacing
- colors
- typography
- border radius
- block order
- add / remove simple UI elements

Explicitly forbidden from automatic patching:

- business logic
- API calls
- form logic
- hooks
- routing
- data layer

## Safety model

Patcher only targets JSX nodes addressable by stable `data-ui-id`.

It refuses unsafe subtrees that contain unsupported JSX expressions or spread attributes.

## Patcher behavior

The code patcher can:

- find JSX node by `uiId`
- change text
- change `className`
- change `style`
- add / remove simple child elements
- preserve non-managed attributes such as event handlers and `type`

Managed attributes in MVP:

- `data-ui-id`
- `className`
- `style`
- simple static children

## API

`POST /api/figma-to-code/sync`

Example body:

```json
{
  "project": "marketing-site",
  "fileKey": "abc123",
  "rootDir": "/repo",
  "apply": true,
  "uiIds": ["landing.hero"]
}
```

## Output

Returns:

- normalized Figma document
- diff entries
- patch summary
- safety notes

## Current implementation note

For MVP, patching uses safe replacement of simple JSX subtrees identified by stable `uiId`, while preserving non-managed attributes from the original code when possible.
