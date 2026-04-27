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

## Runtime font diagnostics

For live troubleshooting, the plugin runtime also supports:

- `debug_runtime_info`

This returns a runtime build marker plus the list of available `Inter` font styles visible to the running plugin session. It is only intended for debugging runtime font resolution mismatches.

## Runtime shadow parsing

`set_effects` now supports parsing multiple CSS box-shadow entries, including `inset` shadows, into Figma-compatible effect payloads.

## SVG asset and effect compatibility

Best-practice runtime behavior for visual fidelity:

- inline SVG and accessible `.svg` asset sources should be imported through `createNodeFromSvg`, not treated as raster image fills
- raster assets should continue to use image fills
- shadow effects with non-zero spread may require `clipsContent = true` on eligible Figma containers to be accepted by the editor

## Fidelity and bidirectional verification runtime

The command bus now exposes extra Figma-side truth commands for two-way sync work:

- `create_frame_rich` -> creates a frame and applies geometry, fills, strokes, radius, opacity, clipping, Auto Layout, padding, sizing, effects and plugin data in one plugin-side operation.
- `create_text_rich` -> alias-compatible rich text creation using the same runtime path as `create_text`, including font resolution and a returned actual text-node snapshot.
- `export_node_snapshot` -> returns the actual Figma node state after write operations, including geometry, fills, strokes, radius, effects, layout, constraints, text metrics, plugin `uiId` and recursive children. It can also include `JSON_REST_V1` output for REST-shaped inspection.
- `export_node_as_image` -> exports a node as PNG/JPG/SVG/PDF and returns metadata plus base64 image data unless `returnImageData=false` is passed.

`execute-plugin-batch` also supports a payload flag:

```json
{
  "returnSnapshots": true,
  "commands": [
    {
      "type": "create_frame_rich",
      "payload": {
        "ref": "hero",
        "uiId": "landing.hero",
        "name": "Hero",
        "width": 1440,
        "height": 720,
        "fills": [{ "type": "SOLID", "color": { "r": 1, "g": 1, "b": 1 } }],
        "layoutMode": "VERTICAL",
        "paddingTop": 96,
        "paddingRight": 80,
        "paddingBottom": 96,
        "paddingLeft": 80,
        "itemSpacing": 24
      }
    },
    {
      "type": "export_node_snapshot",
      "payload": { "nodeRef": "hero", "includeChildren": true, "includeRestJson": true }
    }
  ]
}
```

This exists for bidirectional sync: the write result should become an observed Figma-side baseline for mapping, reconcile and future Figma -> code handoff instead of trusting the requested command payload blindly.

## Auto Layout validation

The plugin runtime now validates common Figma Auto Layout constraints before applying layout mutations:

- padding requires `layoutMode` to be `HORIZONTAL` or `VERTICAL`
- `BASELINE` counter-axis alignment requires horizontal Auto Layout
- `FILL` sizing requires the node to be a child of an Auto Layout parent
- `counterAxisSpacing` requires `layoutWrap=WRAP`
- `SPACE_BETWEEN` may make explicit `itemSpacing` visually irrelevant, so the runtime returns a warning

Validation errors are surfaced as normalized plugin command errors. Non-fatal fidelity risks are returned in the command `data.warnings` array.

## SVG asset command semantics

`set_asset_reference` supports SVG file assets in addition to raster images.

When payload includes `sourceKind="svg"`, `figmaStrategy="vector_icon"`, a `.svg` URL, a `data:image/svg+xml` URI, or a gateway asset proxy URL whose original `src`/`sourceKind` identifies SVG, the plugin runtime should:

1. fetch SVG markup through the gateway-aware fetch path
2. import it with `figma.createNodeFromSvg(...)`
3. append the imported vector node to the target frame
4. store asset metadata in plugin data
5. return an actual snapshot for bidirectional reconcile

SVG import failures are non-fatal. The target node remains in Figma as a placeholder with plugin data containing the source and error. This avoids breaking large live imports because of one unsupported SVG while still giving reverse-sync enough evidence to produce an asset-level issue.

## Design-system snapshot command

`export_design_system_snapshot` reads an observed design-system sidecar and returns a machine-readable snapshot for reverse sync.

Payload examples:

```json
{ "uiId": "design-system/parts-avtopribor-ru" }
```

```json
{ "uiIdPrefix": "design-system/", "includeNodeSnapshots": true }
```

Returned data includes:

- `root`
- `document`
- `tokens[]`
- `bindings[]`
- `tokenCount`
- `bindingCount`

`tokens[]` are read from `figma-gateway:design-system-token` plugin data on sidecar specimens.
`bindings[]` are read from `figma-gateway:design-system-bindings` plugin data on original mockup nodes.

This keeps observed design systems bidirectional: the sidecar can be generated from code/rendered truth and later read back from Figma for code handoff or reconcile.

## Button state set command

`create_button_state_set` creates an editable Figma state set for button-like components.

Default states:

- `default`
- `hover`
- `active`
- `focus`
- `disabled`
- `visited`

The command creates a wrapper frame and one editable button specimen per state. The runtime stores state metadata in plugin data:

- `figma-gateway:button-state-set` on the wrapper
- `figma-gateway:button-state` on each state specimen

This command is used by observed design-system generation for button component patterns. It gives GPT and future code handoff a stable state vocabulary instead of inferring hover/disabled behavior from one static screenshot.

## Design-system handoff and interactive pattern metadata

`export_design_system_snapshot` now returns more than token specimens and bindings. It also reads:

- `figma-gateway:design-system-handoff`
- `figma-gateway:interactive-pattern`

The returned snapshot includes:

- `handoff`
- `interactivePatterns[]`
- `interactivePatternCount`

Interactive pattern metadata is audit-only in MVP1.2. It is generated from rendered evidence without clicking, hovering, submitting forms or advancing carousels.
