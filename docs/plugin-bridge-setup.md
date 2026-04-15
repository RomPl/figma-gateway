# Plugin bridge setup

## What this enables

- automatic plugin session registration for the currently open Figma file
- automatic session discovery for GPT Actions
- queued `create-page`, `create-frame`, `create-section`, `duplicate-block`, and `update-text` commands from GPT Actions
- plugin-side execution inside Figma with a visible status UI

## Files

- `plugin-bridge/manifest.json`
- `plugin-bridge/code.js`
- `plugin-bridge/ui.html`
- `openapi/openapi-gpt-plugin-bridge.yaml`

## Configure the plugin

Open `plugin-bridge/code.js` and replace the bearer token constant with your real `API_BEARER_TOKEN`.

## Load the plugin in Figma

1. Open Figma desktop app or browser app
2. Open the target design file
3. Go to Plugins -> Development -> Import plugin from manifest...
4. Select `plugin-bridge/manifest.json`
5. Run `Figma Gateway Plugin Bridge`
6. The plugin will automatically register a session and start polling

## Plugin UI

The plugin UI shows:

- connection status
- current sessionId
- current file name and file key/local identifier
- last successful poll time
- last processed command
- pending command count
- last error

The UI also provides:

- `Refresh status`
- `Reconnect session`
- `Copy sessionId`

## Connect GPT Actions

Import:

- `openapi/openapi-gpt-plugin-bridge.yaml`

Auth:

- API Key
- Bearer
- value = raw `API_BEARER_TOKEN` without the `Bearer ` prefix

## Recommended GPT workflow

### Preferred flow

1. Ensure the Figma plugin bridge is running in the target file
2. Call `createPage` or `createFrame` with just the write payload plus optional `clientName`
3. The server automatically resolves the latest active plugin session

### Explicit flow for debugging

1. `registerPluginSession`
2. `listActivePluginSessions`
3. `createPage` with explicit `sessionId`

## Example

### Auto-resolved page creation

```json
{
  "name": "Checkout Concepts",
  "clientName": "ChatGPT web108",
  "dryRun": false
}
```

### Explicit page creation

```json
{
  "sessionId": "pbs_...",
  "name": "Checkout Concepts",
  "dryRun": false
}
```

## Important limitation

This bridge currently supports the queued `create-page` flow. It does not yet create brand new Figma files/projects.


### Auto-resolved frame creation

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


### Auto-resolved text update

```json
{
  "nodeId": "12:34",
  "text": "Updated headline",
  "clientName": "ChatGPT web108",
  "dryRun": false
}
```


### Auto-resolved section creation

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


### Auto-resolved block duplication

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
