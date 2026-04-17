# Plugin command bus

## Purpose

Plugin bridge is now a low-level Figma write runtime.

Instead of exposing a separate HTTP endpoint for every small UI mutation, the backend can queue one typed command or a batch of typed commands, and the plugin executes them inside the open Figma file.

This keeps write control server-side, validation centralized, and execution delegated to the Figma Plugin API.

## Low-level command types

Supported generic command types:

- `create_text`
- `create_group`
- `move_node`
- `delete_node`
- `rename_node`
- `set_fill`
- `set_stroke`
- `set_corner_radius`
- `set_opacity`
- `set_size`
- `set_position`
- `set_text_content`
- `set_text_style`
- `set_auto_layout`
- `set_padding`
- `set_spacing`
- `set_alignment`
- `set_constraints`
- `set_layout_sizing`
- `set_visibility`
- `set_plugin_data`
- `get_plugin_data`
- `find_nodes`

## Transport model

Two generic write endpoints are the main low-level runtime surface:

- `POST /api/write/execute-plugin-command`
- `POST /api/write/execute-plugin-batch`

Legacy higher-level endpoints such as `create-frame`, `update-text`, `create-section`, `duplicate-block`, and `apply-style-from-alias` still exist, but the universal runtime is the generic command bus.

## Validation

Backend validates:

- `command.type`
- basic payload shape
- write enable flag
- write allowlist membership
- plugin session resolution

Validation happens before queueing any live command.

## Batch execution

Batch execution is sequential inside the plugin.

Returned batch result is normalized and includes:

- `status`
- `total`
- `successCount`
- `errorCount`
- `results[]`

A batch may finish with partial failure. In that case individual step results remain visible and the command is marked with mapped plugin error metadata.

## Normalized result format

Each executed low-level command returns a normalized result object:

```json
{
  "commandType": "set_text_content",
  "status": "ok",
  "nodeId": "12:34",
  "data": {
    "id": "12:34",
    "text": "Hello"
  }
}
```

On failure:

```json
{
  "commandType": "set_text_content",
  "status": "error",
  "nodeId": null,
  "error": {
    "code": "NODE_NOT_FOUND",
    "message": "Node not found for set_text_content: 12:34"
  }
}
```

## Error mapping

Plugin runtime maps common failures into normalized error codes:

- `INVALID_COMMAND_PAYLOAD`
- `UNSUPPORTED_COMMAND`
- `UNSUPPORTED_OPERATION`
- `NODE_NOT_FOUND`
- `FONT_LOAD_FAILED`
- `STYLE_ALIAS_NOT_FOUND`
- `PLUGIN_RUNTIME_ERROR`
- `PLUGIN_BATCH_PARTIAL_FAILURE`

## Example single command

```json
{
  "clientName": "ChatGPT web108",
  "dryRun": false,
  "command": {
    "type": "set_text_content",
    "payload": {
      "nodeId": "12:34",
      "text": "Updated headline"
    }
  }
}
```

## Example batch

```json
{
  "clientName": "ChatGPT web108",
  "dryRun": false,
  "commands": [
    {
      "type": "create_text",
      "payload": {
        "name": "Headline",
        "text": "Hello",
        "x": 100,
        "y": 120
      }
    },
    {
      "type": "set_text_style",
      "payload": {
        "nodeId": "12:34",
        "fontSize": 48,
        "textAlignHorizontal": "CENTER"
      }
    },
    {
      "type": "set_fill",
      "payload": {
        "nodeId": "12:34",
        "fills": [
          {
            "type": "SOLID",
            "color": { "r": 0.145, "g": 0.388, "b": 0.922 }
          }
        ]
      }
    }
  ]
}
```

## Limits

This is not unrestricted system access. It is a broad write runtime on top of the Figma Plugin API, scoped to:

- the currently open file
- the connected plugin session
- capabilities actually exposed by Figma Plugin API


## Reading completed command results

For debugging plugin-enriched exports and batch execution results, the server also supports:

- `GET /api/plugin-bridge/sessions/{sessionId}/commands/{commandId}`

This returns the queued/completed/failed command object, including `result` or `error` when available. Access requires the plugin session token via `x-plugin-session-token` or `sessionToken` query param.

## Dispatch lease and duplicate prevention

`GET /commands/pending` is no longer a pure read of all queued commands.

Server behavior now:

- if a command is already dispatched and its lease is still fresh, pending returns no new commands for that session
- otherwise the next queued command is marked `dispatched` and returned once
- if a plugin or server restart leaves a command stuck in `dispatched`, the lease expires and the command becomes queued again

This prevents the same long live batch from being returned again on every poll cycle, which was a primary source of duplicate node creation.

## Session persistence

Plugin bridge sessions and queued commands are persisted in SQLite.

This allows the backend to preserve plugin sessions and command state across gateway restarts instead of forcing a manual plugin reconnect every time the service restarts.
