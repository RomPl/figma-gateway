# Task 17 — Create page / create file support plan

Дата: 2026-04-15
Статус: blocked by missing live write backend and missing Figma editor/plugin bridge

## What is confirmed right now

Current gateway supports only guarded write operations inside an existing file:

- create-frame
- create-section
- update-text
- duplicate-block
- apply-style-from-alias

These operations currently run through the write service abstraction, but the default live adapter is not configured. In production, dry-run can succeed, but there is no live backend capable of mutating Figma.

## Why "create new Figma file" cannot be enabled immediately here

The current server has no supported backend for creating a brand new Figma file/project through the existing write adapter.

Confirmed current server limitations:

- no live write adapter implementation is configured
- no plugin bridge exists
- no page-level create operation exists in the gateway code
- no file-level create operation exists in the gateway code

## Why "create new page" cannot be enabled immediately here

Creating a new page inside a Figma document requires an execution path that acts inside the Figma editor/plugin environment.

The current server does not have:

- active plugin session management
- editor bridge transport
- authenticated command relay from gateway to plugin runtime

## Required implementation path

### Phase 1 — add explicit server-side capability model

Add support declarations to the gateway:

- supportsCreatePage: false
- supportsCreateFile: false
- liveWriteBackendConfigured: false
- pluginBridgeConfigured: false

Expose this via:

- `/version`
- `/capabilities` or `/health/details`

### Phase 2 — add page/file creation contracts

Add request/response contracts for:

- `create-page`
- `create-file`

Even before live support exists, the API should return explicit errors:

- `CREATE_PAGE_BACKEND_NOT_CONFIGURED`
- `CREATE_FILE_BACKEND_NOT_CONFIGURED`
- `PLUGIN_BRIDGE_REQUIRED`

### Phase 3 — implement plugin bridge for page creation

Needed components:

- Figma plugin
- plugin session registration with gateway
- secure session token / pairing code
- websocket or polling channel between plugin and gateway
- server command relay: `createPage`, `createFrame`, `createSection`, `updateText`
- audit trail for plugin-executed writes

### Phase 4 — implement “new design from template” workflow

Practical replacement for true file creation:

- user chooses existing target file
- gateway creates a new page in that file
- gateway populates it with base frames/sections/content

This is the recommended near-term implementation.

### Phase 5 — if required, add file-level duplication workflow

If true "new file" UX is needed, implement a documented workflow such as:

- duplicate from known template file
- return new file metadata
- then operate inside the duplicated file

This depends on what Figma officially permits in the chosen integration path.

## Recommended product wording

Use these labels instead of promising unsupported behavior today:

- "Create new page in current file"
- "Create new design workspace in file"
- "Create design draft from template"

Avoid claiming:

- "Create brand new Figma file" (until a real backend exists)

## Immediate next implementation target

The first real deliverable should be:

- plugin bridge + `createPage` support

This unlocks the practical workflow users actually need for "new design document".
