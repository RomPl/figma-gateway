# Troubleshooting

## Plugin bridge connected but page is not created

Check the plugin UI:

- `Status` should be `Connected`
- `Last poll` should update every few seconds
- `Last error` should be empty
- `Last command` should change from `Session registered` to `create-page -> ...`

## 404 on pending commands

Cause:

- the plugin is polling a stale sessionId

Fix:

- click `Reconnect session` in the plugin UI
- or restart the plugin
- retry the GPT action after the new session is visible

## GPT queued a command but nothing happened

Cause:

- GPT may have resolved a different active session than the one currently visible

Fix:

- keep only one plugin bridge running for the target file
- use `clientName` to help auto-resolution when needed
- for debugging, call `listActivePluginSessions`

## Dry run confusion

- `createPage` defaults to live mode when `dryRun` is omitted
- set `dryRun: false` explicitly when verifying behavior
