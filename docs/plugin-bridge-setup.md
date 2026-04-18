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


## Session restore after restart

The plugin now attempts to restore the last session for the same file on startup before registering a new session.

Restore logic:

- read previous `sessionId/sessionToken` from plugin client storage
- verify that stored session belongs to the same file identity
- validate it by polling pending commands
- reuse it if valid, otherwise clear it and register a fresh session

## Plugin UI

The plugin UI shows:

- connection status
- current sessionId
- current file name and file key/local identifier
- last successful poll time
- last processed command
- pending command count
- active session count for the current file
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

## Important operational rule

Keep only one active plugin bridge session per Figma file during live import and reconcile work.

The plugin UI now also shows how many active bridge sessions exist for the current file. Clicking the active-session button keeps only the current session connected and marks sibling sessions for the same file as inactive.

If multiple active sessions exist for the same file, the server now rejects live import batches with `MULTIPLE_ACTIVE_SESSIONS` instead of guessing which plugin should execute the command bus.
