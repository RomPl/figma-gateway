# Plugin command bus

## Purpose

This is the closest practical equivalent to a broad "root-like" execution layer for Figma, within the limits of the Figma Plugin API.

Instead of adding a separate Action for every operation, GPT can queue:

- `executePluginCommand`
- `executePluginBatch`

The running Figma plugin bridge resolves the active session automatically and executes the command(s) inside the open file.

## Supported generic command types

- `create_page`
- `create_frame`
- `create_section`
- `update_text`
- `duplicate_block`
- `apply_style_from_alias`

## Example single command

```json
{
  "clientName": "ChatGPT web108",
  "dryRun": false,
  "command": {
    "type": "create_frame",
    "payload": {
      "name": "Hero",
      "width": 1440,
      "height": 900,
      "x": 0,
      "y": 0
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
      "type": "create_section",
      "payload": {
        "name": "Landing",
        "width": 1440,
        "height": 2000
      }
    },
    {
      "type": "create_frame",
      "payload": {
        "name": "Hero",
        "width": 1440,
        "height": 900,
        "x": 0,
        "y": 0
      }
    }
  ]
}
```

## Limits

This is not true operating-system root access.
It is a universal command bus on top of the Figma Plugin API, scoped to the currently open file and whatever the Figma runtime allows.


## Alias styles

Current demo plugin registry aliases:

- `hero-primary`
- `footer-contact`

These are currently applied inside the plugin through a small local style registry.
