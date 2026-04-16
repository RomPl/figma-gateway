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

For text and other flow children inside non-absolute containers, planner must keep coordinates relative to the parent frame, not absolute page coordinates.

Universal rule:

- browser `clientRect` can be absolute in viewport space
- Figma child positioning must be parent-relative unless the node is truly absolute/fixed/sticky
- parent-centered flow blocks should be reconstructed through parent alignment / auto layout when possible, not by replaying page-space text coordinates

## Cleanup before repeated rendered-first imports

Repeated rendered-first imports into the same Figma page can leave older roots with the same logical sync identity.

To avoid exporting stale sections/frames on later passes, the runtime should delete previously imported root nodes that match the current root `uiId`/name before creating the new tree.
