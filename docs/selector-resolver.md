# Human-language block addressing

## Purpose

This layer lets the agent resolve natural references such as:

- "change hero"
- "sync footer"
- "make pricing cards denser"

Instead of requiring exact technical identifiers every time.

## Supported selector strategies

- by `uiId`
- by node name
- by semantic role
- by text
- by tree path
- by fuzzy match

Examples:

- `hero`
- `landing.hero`
- `button with text "Get started"`

## Resolver behavior

The resolver searches normalized UI trees from:

- code
- Figma
- or both

It returns ranked matches with:

- `uiId`
- source side
- score
- match kinds
- tree path
- source metadata
- reasons explaining why the node matched

## API

`POST /api/selectors/resolve`

Example body:

```json
{
  "query": "button with text \"Get started\"",
  "project": "marketing-site",
  "fileKey": "abc123",
  "rootDir": "/repo",
  "source": "both",
  "limit": 5
}
```

## Intent integration

Intent-based commands can now accept `selector` in payload.

For example, `sync_block_to_figma` can be called with:

```json
{
  "intent": "sync_block_to_figma",
  "payload": {
    "project": "marketing-site",
    "selector": "hero",
    "fileKey": "abc123",
    "rootDir": "/repo",
    "dryRun": true
  }
}
```

The selector is resolved first, then the matching `uiId` set is passed into the underlying pipeline.
