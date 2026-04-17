# Code → Figma pipeline

## Goal

This is the execution path for the scenario:

- "recreate the mockup in Figma"

The pipeline creates editable Figma-native structure, not a flattened image.

## Main rule

Code -> Figma must not rely on AST alone for visual fidelity.

The pipeline should use:

1. Code AST for source mapping and safe ownership
2. Rendered UI Snapshot for visual truth
3. Design Tokens for design intent
4. Figma commands for design target creation/update

## Pipeline stages

1. parse project code
2. capture Rendered UI Snapshot from real browser render
3. bind rendered nodes to `uiId`, code ownership and source ranges
4. resolve token candidates from rendered values
5. build Unified UI Model with rendered visual fields as baseline
6. build execution plan
7. translate plan into plugin bus commands
8. queue batch execution in Figma plugin bridge
9. assign `uiId`
10. write mapping registry entries

## Planner

Planner converts Unified UI Model into Figma-native actions.

Planner must treat rendered DOM/CSS as the primary source of:

- layout
- spacing
- dimensions
- typography
- color
- radius
- visibility
- asset usage

## Important property

The plugin creates normal Figma nodes:

- sections
- frames
- text layers

So the result remains editable in Figma.

## Mapping registry

Every planned node writes or updates mapping data by `uiId`.

The desired mapping model is:

- Code AST mapping for patch ownership
- Rendered snapshot reference for visual truth
- Figma node mapping for design target
- token bindings for design intent

## Outcome

The agent should understand that Code -> Figma is not "convert JSX into frames".

It is "reconstruct in Figma what the browser actually renders", while still using AST for safe traceability and patch ownership.


## Naming policy

For rendered-first generation, Figma node names should prefer browser-derived DOM identity instead of raw `uiId`.

Preferred formula:

- `tag-id-css_class`

Where:

- `tag` comes from rendered DOM tag name
- `id` is included only when DOM `id` exists
- `css_class` is included only when CSS class exists

Examples:

- `div-hero-card`
- `button-submit-btn.primary`
- `h1-page-title`

This naming improves Figma inspection and keeps nodes aligned with browser-rendered structure while `uiId` remains the sync key in plugin data and mapping registry.



## Flow positioning rule

## Layout-first flow reconstruction

Planner should reconstruct ordinary text placement from layout cues before using raw geometry.

Universal rule for flow text in non-absolute containers:

- derive horizontal intent from child `text-align` and parent centering cues
- if the text is flow-centered or right-aligned, use the parent content width as the Figma text box width
- use `textAutoResize=HEIGHT` for fixed-width flow text boxes
- reserve `set_position` for parent-relative fallback placement, not page-space replay

For text and other flow children inside non-absolute containers, planner must keep coordinates relative to the parent frame, not absolute page coordinates.

Universal rule:

- browser `clientRect` can be absolute in viewport space
- Figma child positioning must be parent-relative unless the node is truly absolute/fixed/sticky
- parent-centered flow blocks should be reconstructed through parent alignment / auto layout when possible, not by replaying page-space text coordinates

## Cleanup before repeated rendered-first imports

Repeated rendered-first imports into the same Figma page can leave older roots with the same logical sync identity.

To avoid exporting stale sections/frames on later passes, the runtime should delete previously imported root nodes that match the current root `uiId`/name before creating the new tree.

## Wrapper fill suppression

Planner must not create fills for transparent wrapper/layout nodes that only provide spacing, centering or flow structure.

Examples:

- bootstrap/grid wrappers like `row`, `col-*`, `justify-content-*`
- plain spacing wrappers like `mb-*`, `mt-*`, `text-center`
- switch/form wrappers with transparent backgrounds

If a node has no meaningful background, no border, no radius and no shadow, it should remain visually transparent in Figma.

## Effects and icons

Planner should preserve browser `box-shadow` through Figma `effects` when supported.

Font/SVG icons should use native icon reference commands when available instead of text placeholders.

## Explicit transparent fill reset

Figma frames may keep a default visible fill even when the browser node is fully transparent.

For transparent wrappers, icon containers and outline-only controls, planner must emit an explicit `set_fill` with an empty fills array so that the node stays visually transparent in Figma.

## Frame-only rendered containers

Rendered-first imports should create normal containers as Figma `frame` nodes by default.

Do not promote browser sections/wrappers to Figma `section` during normal page reconstruction. Figma sections are page-organization primitives, not visual layout primitives.

## Capability-aware write planning

Planner must not emit layout mutations blindly. Before sending write steps such as padding, corner radius or transparent fill reset, it should restrict them to node kinds that are expected to support those operations in Figma.

This avoids partial-failure batches on larger projects with mixed group/frame/text structures.

## Stable auto-node identity

All rendered-first synthetic nodes should use one stable tree-based identity scheme for `uiId`. Mixed identity schemes cause parent-child ref drift and lead to `NODE_NOT_FOUND` errors during batch execution.

## Decorated text containers

Inline-flex pills, badges, chips and other text-bearing containers with padding/background/radius should be reconstructed as `frame + label`, not as bare text nodes.

## Auto-centered containers

Containers centered by `mx-auto` or equivalent auto margins should be positioned from parent width, not only replayed from raw DOM coordinates.

## Single active plugin session rule for live import

Live Code -> Figma and rendered-first imports must be blocked when more than one active plugin bridge session exists for the same Figma file.

Server behavior:

- resolve the requested session or auto-resolve the active file session
- collect active sessions for the same `fileKey` or `localFileKey`
- if more than one active session exists, reject the live batch with `MULTIPLE_ACTIVE_SESSIONS`
- allow dry-run planning to continue because no plugin-side mutation is queued

This guard prevents duplicate batch execution, repeated `complete` calls, 429 noise and the false impression that the import loop is stuck.
