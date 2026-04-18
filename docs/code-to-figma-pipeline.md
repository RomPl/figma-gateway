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

## CSS-aware alignment recovery

Rendered-first planner should preserve block centering and wrapping from real CSS, not only from guessed geometry.

Important signals:

- `margin-left: auto` + `margin-right: auto` for centered blocks such as `mx-auto`
- `flex-wrap` for wrapped chip/tag rows
- parent-relative flow placement for ordinary non-absolute children

This allows centered wrappers and wrapped inline-flex groups to map into more stable Figma layout.

## Unsupported block placeholder rule

If a rendered block is detected as unsupported for faithful reconstruction, planner should stop descending into that subtree and create a visible placeholder with the same block size.

Current placeholder behavior:

- keep the container size
- fill the block with red placeholder paint
- add red stroke
- write plugin data with the fallback reason
- skip impossible inner children to avoid misleading partial reconstruction

Typical placeholder triggers:

- unsupported rendered regions such as `canvas`
- untrusted runtime-only visual blocks
- unsupported background-image reconstruction
- missing required asset source for non-decorative assets

## Heuristic rendered root should not collapse the whole page

A synthetic rendered root such as `body` may legitimately carry page-level guardrails like `runtimeBaseline=untrusted`, `dynamicStatefulBlock`, or `heuristic_node` when no explicit `rootUiId` is provided.

These guardrails should lower confidence, but must not automatically convert the entire page tree into one red placeholder block.

The planner should still descend into the rendered subtree and reserve red placeholders for genuinely unsupported subregions only.

## Visual segmentation layer

Rendered-first planning should not translate raw DOM fragments directly into Figma.

A segmentation pass now runs before planning so that the pipeline can distinguish between:

- stable component boundaries
- visual blocks
- layout wrappers
- text carriers
- unsupported visual islands

Compatibility rule:

- `uiId` remains unchanged for durable sync
- segmentation metadata is added under node `meta`
- wrapper collapse is conservative and only targets synthetic rendered wrappers that are visually empty and single-child

## Atomic rendered text creation

Rendered-first text nodes should be created atomically whenever possible.

Instead of emitting a fragile chain like:

- `create_text`
- `set_fill`
- `set_text_style`
- `set_size`
- `set_position`

planner now prefers one `create_text` payload that already carries:

- fill
- typography
- text box width/height
- initial x/y

This reduces batch fragility for nested text nodes inside large rendered-first imports.

## Deferred sizing for auto-layout interactive containers

For rendered-first auto-layout controls such as button-like containers with text and/or icon content, planner should append child content before applying the final fixed size.

This keeps the batch closer to real browser layout flow and avoids fragile parent/child attachment in live plugin execution for interactive controls.

## Text-only centered wrappers as render-first flow stacks

A plain block wrapper with multiple text children can still be a layout-first container even without CSS flex.

When rendered flow indicates a centered text stack, planner should reconstruct it as a vertical auto-layout frame instead of a plain positioned frame with manually placed text children.

This keeps the result closer to browser flow layout and reduces fragile parent-child attachment in live plugin batches.

## Synthetic labels for inline icon containers

When a render-first frame/group carries its own text and only icon children, planner should synthesize a text label child instead of leaving the container icon-only.

This is required for inline-flex links, badges and CTA-like controls where browser text is part of the same visual container.

## Grid reconstruction

Render-first wrappers with `display:grid` should be reconstructed as wrapping horizontal auto-layout containers when possible.

This keeps child hierarchy editable and avoids flattening the grid into unrelated absolutely-positioned frames.

## Transparent text-wrapper shortcut must not remove real layout containers

The planner may skip a synthetic transparent text-only wrapper only when it is a passive block wrapper.

If the wrapper is a real layout container (`flex`, `inline-flex`, or `grid`), it must stay in the plan so nested text stacks remain attached to their own item frame instead of leaking directly into the outer grid/flex parent.

## Typography compatibility pass for older plugin runtimes

Even when `create_text` carries full typography payload, planner now also emits an immediate `set_text_style` compatibility command.

This is intentionally redundant for newer runtimes, but helps older running plugin sessions apply the intended font family/style/weight after text creation instead of collapsing to `Regular`.

## Semantic Figma-facing naming with stable sync identity

Render-first planning should expose cleaner Figma-facing names such as `Header`, `Main`, `Footer`, `Section`, `Container`, `Card`, `Text`, `Icon`, and `Button`.
This normalization is conservative: it only replaces clearly technical DOM/class-derived names, while preserving human-authored names like `Hero` or `CTA` and still appending the stable `uiId`.
Small visual icon-holder wrappers (for example `48x48` centered circular containers around SVG icons) must stay as their own frame nodes with child icon attachment and auto-layout centering. They must not collapse into a bare icon layer during render-first planning.
When CSS `box-shadow` contains several non-zero entries, planner should preserve the normalized multi-entry stack for plugin-side effect parsing instead of collapsing everything to a single strongest shadow. Inset-specific fidelity still needs a dedicated follow-up pass.
Repeated card grids must preserve both layers: the outer wrapping grid container and each individual card wrapper with its own internal vertical text stack. Card copy must stay attached to its own card frame instead of leaking directly into the grid parent.
For shell-like surfaces (`app_shell`, `auth_gated_spa`), planner must write both `shell-selection-mode` and `content-selection-mode` plugin-data on the planned root so the chosen content work surface remains explicit during downstream review and reconcile.
Current render-first SVG/effects fidelity now includes: preserved multi-shadow stacks, fallback `viewBox` injection, scaled `stroke-width`, nested `currentColor` rewrite, and explicit `needsReview` signaling for low-confidence effect-heavy nodes.
`CodeToFigmaPipelineResult` now also carries a compact `hierarchySummary` (node/container/text/button/icon/image counts plus max depth). This is intended as the measurable baseline for later reference-comparison passes.

This naming layer must not change the stable `uiId`. Reverse sync and selector resolution continue to use `uiId` as the primary durable identity.

## SVG icon markup should be sanitized for Figma import

Before sending inline SVG markup to the plugin runtime, planner should sanitize browser-oriented SVG attributes for better Figma compatibility.

Current sanitation includes:

- ensure `xmlns`
- strip noisy `class` / `data-*` / `aria-*` attributes
- replace `currentColor` with explicit fill/stroke when available
Nested inline SVG nodes should also have `currentColor` rewritten to explicit `fill`/`stroke` values when those values are known, not only the outer `<svg>` element.

Additional compatibility step for older runtimes:

- after `set_text_style`, planner also reapplies `set_text_content`

This is intended to preserve the requested font style in runtimes that may reset text styling during character assignment.

## Figma display names should preserve original node names and append stable uiId

For operator-friendly inspection and precise discussion in Figma, display names should keep the original node/model name and append the stable `uiId` through ` - `.

Example:

- `div-relative.mx-auto.max-w-screen-xl - __auto__/div[2]/main[1]/...`
- `h2-text-3xl.font-bold.text-foreground - __auto__/div[2]/main[1]/...`

This improves human reference in Figma while keeping reverse sync anchored on `uiId` itself.

## Figma-friendly font family normalization

When browser CSS reports a generic UI font stack, planner should normalize it to a concrete Figma-friendly family before runtime font resolution.

For the current template-engine project this prevents fallback into emoji/symbol families and keeps text aligned with the design intent.
