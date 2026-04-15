# Code → UI Model parser

## Goal

This parser turns React component code into a normalized UI tree instead of treating files as plain text.

## MVP support

- React components
- JSX tree
- text nodes
- `className`
- inline `style`
- basic Tailwind interpretation
- simple component wrappers

## Extracted data

For each UI node the parser tries to extract:

- structure / parent-child hierarchy
- text
- basic styles
- layout hints
- `uiId`
- component names
- file path
- line range
- JSX path

## Source mapping

Source mapping is stored in `UiNode.source`:

- `codePath`
- `codeExportName`
- `lineStart`
- `lineEnd`
- `jsxPath`

## API

`POST /api/code-ui/parse`

Example body:

```json
{
  "componentName": "Hero",
  "limit": 20
}
```

Optional filters:

- `rootDir`
- `componentName`
- `filePath`
- `limit`

## Output

The parser returns one or more component trees in Unified UI Model format.

## Current limitations

This is intentionally MVP-level parsing.

It does not attempt full semantic execution of React code, prop evaluation, arbitrary expression resolution, or complete Tailwind coverage.
