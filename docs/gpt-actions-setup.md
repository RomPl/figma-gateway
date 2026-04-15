# GPT Actions setup

## Recommended schema for plugin bridge flow

Use:

- `openapi/openapi-gpt-plugin-bridge.yaml`

## Auth

- type: API Key
- auth mode: Bearer
- value: raw `API_BEARER_TOKEN`

## Recommended Instructions behavior

When the user asks to create a page or frame in the currently open Figma file:

1. Prefer `createPage` or `createFrame` directly without calling `registerPluginSession` manually
2. Provide the minimal write payload and optionally `clientName`
3. Set `dryRun: false` for live execution
4. Only use `registerPluginSession` or `listActivePluginSessions` for debugging or explicit session troubleshooting

## Example action request

```json
{
  "name": "Homepage Concepts",
  "clientName": "ChatGPT web108",
  "dryRun": false
}
```

## Preconditions

- the Figma file must be open
- the plugin bridge must be running in that file
- the plugin bridge auto-registers and maintains the active session


## Example frame action request

```json
{
  "name": "Hero Frame",
  "width": 1440,
  "height": 1024,
  "x": 0,
  "y": 0,
  "clientName": "ChatGPT web108",
  "dryRun": false
}
```


## Example text update action request

```json
{
  "nodeId": "12:34",
  "text": "Updated headline",
  "clientName": "ChatGPT web108",
  "dryRun": false
}
```


## Example section action request

```json
{
  "name": "Hero Section",
  "width": 1440,
  "height": 1024,
  "x": 0,
  "y": 0,
  "clientName": "ChatGPT web108",
  "dryRun": false
}
```


## Example duplicate block action request

```json
{
  "nodeId": "12:34",
  "name": "Duplicated Hero",
  "x": 100,
  "y": 100,
  "clientName": "ChatGPT web108",
  "dryRun": false
}
```


## Generic plugin command bus

Use `executePluginCommand` for one operation or `executePluginBatch` for multiple operations when you do not want a separate action call per specific write operation.
