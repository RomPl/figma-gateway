# Code → Figma pipeline

## Goal

This is the execution path for the scenario:

- "recreate the mockup in Figma"

The pipeline creates editable Figma-native structure, not a flattened image.

## Pipeline stages

1. parse project code
2. build Code UI Model
3. build execution plan
4. translate plan into plugin bus commands
5. queue batch execution in Figma plugin bridge
6. assign `uiId`
7. write mapping registry entries

## Planner

Planner converts Unified UI Model into Figma-native actions.

Current planner action vocabulary:

- `create_section`
- `create_frame`
- `create_text`
- `set_auto_layout`
- `set_fill`
- `set_text_style`
- `move_node`

## Execution transport

Execution is performed through plugin bus batch command queue:

- `execute-plugin-batch`

The lowered command list uses low-level plugin steps, including:

- `create_section`
- `create_frame`
- `create_text`
- `set_auto_layout`
- `set_padding`
- `set_fill`
- `set_text_style`
- `set_corner_radius`
- `move_node`

## Important property

The plugin creates normal Figma nodes:

- sections
- frames
- text layers

So the result remains editable in Figma.

## API

`POST /api/code-to-figma/build`

Example body:

```json
{
  "project": "marketing-site",
  "componentName": "Hero",
  "fileKey": "abc123",
  "sessionId": "pbs_xxx",
  "dryRun": false
}
```

## Output

The route returns:

- parsed model
- execution plan
- queued plugin batch metadata
- number of mapping registry entries written

## Mapping registry

Every planned node writes or updates mapping data by `uiId`.

Initially, created Figma node ids are stored as pending placeholders until the runtime result can be reconciled.
