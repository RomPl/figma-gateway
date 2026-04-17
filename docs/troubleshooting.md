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


## Session changed after plugin or gateway restart

Expected behavior now:

- plugin first attempts to restore the last session for the same file
- if the restored session is invalid, it clears the stored state and re-registers automatically

Manual fallback:

- click `Reconnect session` in the plugin UI
- verify the newly shown sessionId in the plugin UI

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

## Duplicate roots or old blocks after repeated imports

Cause:

- older rendered-first roots were not fully cleaned before the next import
- root matching by `uiId` alone was too weak on mixed files

Fix:

- cleanup now matches by both `uiId` and root name before the new tree is created
- rendered-first containers are created as frames, not sections, to avoid stale page-organization nodes staying behind

## Text disappeared or batch failed with NODE_NOT_FOUND

Typical causes:

- synthetic auto-node ids were generated from mixed path strategies
- a child text node was planned under a parent ref that no longer matched the final frame-only tree
- decorated inline text containers were collapsed into plain text instead of `frame + label`

Fix:

- use a single tree-based synthetic `uiId` strategy
- create visual text containers as frames with an internal label when they carry background/padding/radius
- validate fill payloads before queueing `set_fill`

## Live import failed with MULTIPLE_ACTIVE_SESSIONS

Cause:

- more than one plugin bridge session is currently active for the same Figma file
- server-side live import protection blocks the batch on purpose

Fix:

- leave only one plugin bridge connected for that file
- in stale plugin windows, click `Reconnect session` or close the extra plugin instance
- verify the expected session with `listActivePluginSessions`
- retry the live import only after a single active session remains

## Live import failed with Playwright executable missing

Cause:

- Chromium browser binaries are missing for the runtime user of `figma-gateway.service`
- installing Playwright under another user cache does not fix the service process

Fix:

- install Chromium for `figma5001` into `/home/figma-gateway.vazovski.art/.cache/ms-playwright`
- retry rendered extraction or live import after installation

## A block should not be recreated literally

If a subtree is driven by unsupported browser runtime features, the planner may intentionally render it as a red placeholder block instead of attempting a misleading partial clone.

Examples:

- canvas-driven visual blocks
- unsupported background-image reconstruction
- untrusted runtime-only visual regions

This is expected behavior and is preferable to silently dropping size/alignment or creating a broken approximation.

## Live import created only `body` and no deeper tree

Cause:

- planner treated page-level synthetic root guardrails such as `heuristic_node` or untrusted runtime baseline as a hard unsupported block
- the whole rendered tree was collapsed into one placeholder root

Fix:

- synthetic rendered roots now remain traversable
- only truly unsupported subtrees should turn into red placeholders

## Too many placeholder asset blocks on normal containers

Cause:

- extractor normalized ordinary layout containers as `decorative-asset`
- planner then emitted placeholder asset references for generic frames that were not real assets

Fix:

- generic containers no longer get asset metadata by default
- only real images, background-image layers and icon-bearing nodes should carry asset info

## Repeating duplicates during live import

Cause:

- synthetic rendered auto-ids were produced from mixed path spaces
- deep children used truncated paths while parents used full paths
- plugin batch then created duplicate branches or lost parent-child attachment

Fix:

- synthetic rendered uiIds now use one full tree-based DOM path without truncation
- rerun the import on a fresh plugin session after gateway restart

## Rendered import creates orphan top-level nodes

Cause:

- plugin runtime resolved a missing parent ref by falling back to the current page
- child nodes were appended as page-level orphans instead of failing fast

Fix:

- resolved parent refs now fail with `PARENT_NODE_NOT_FOUND` instead of silently attaching to the page
- rerun the import on a fresh session after gateway restart

## Auto button labels duplicated inside complex interactive containers

Cause:

- planner emitted synthetic `*.label` text for a frame/group node that already had its own visual subtree

Fix:

- auto-label fallback is now restricted to leaf interactive containers only
- containers with children must rely on their actual child tree instead of an extra synthetic label

## Nested rendered text disappears after create_text

Cause:

- live batch applied follow-up text mutations to the same freshly created text node
- some nested rendered-first text branches became unstable between `create_text` and later text mutations

Fix:

- rendered-first text creation is now more atomic
- typography, fills, size and initial position are pushed into `create_text` whenever possible

## Old rendered-first duplicates keep surviving new imports

Cause:

- cleanup query used `uiIdPrefix`, but plugin runtime only matched exact `uiId`
- stale rendered-first nodes with `__auto__/...` identities remained in the page and accumulated across retries

Fix:

- plugin-side query matching now supports `uiIdPrefix`
- rendered-first cleanup can remove stale synthetic nodes before the new batch starts

## SVG icons degrade to text placeholders

Cause:

- inline SVG icons were not preserved as actual SVG markup through the rendered-first pipeline
- plugin runtime had to fall back to text placeholders

Fix:

- extractor now forwards inline SVG markup when available
- plugin runtime prefers native `createNodeFromSvg` for icon recreation

## Graceful shutdown reports failure but still exits 0

Cause:

- the shutdown callback could call `process.exit(1)` on `server.close()` error and then continue into the success path
- this produced contradictory exit behavior in tests and could mask shutdown failures

Fix:

- graceful shutdown now returns immediately after the error exit path
- shutdown failure and success paths are now mutually exclusive

## Live import says acceptance passed but only body gets created

Cause:

- rendered extractor promoted generic ancestor containers to `svg-icon` because they contained descendant SVG nodes
- planner then treated large layout branches as icon/asset containers and emitted only a tiny command batch

Fix:

- SVG icon detection is now local to the actual `<svg>` node or a narrow icon host only
- generic ancestor wrappers must stay ordinary layout containers even when they contain deeper SVG descendants

## Live batch still duplicates nodes after the main tree appears

Cause:

- nested SVG nodes were still receiving the root synthetic id `__auto__/`
- multiple icon nodes then collided on the same ref/uiId and later text children lost their intended parent chain

Fix:

- synthetic tree-path generation now supports SVG elements too
- nested SVG nodes must receive their own non-root `__auto__/.../svg[n]` identities

## One button branch still breaks live batch after most of the tree is created

Cause:

- an auto-layout interactive container could receive its fixed `set_size` before its synthetic label/icon children were appended
- in live plugin execution this made the branch fragile and later child commands could lose the intended parent chain

Fix:

- auto-layout button-like containers now defer final `set_size` until after child creation in the render-first plan

## Centered text copy block still breaks live import in one branch

Cause:

- a plain `text-center` wrapper with multiple text children was still planned as a non-auto-layout frame with manually positioned text
- this branch remained more fragile in live plugin execution than the neighboring render-first vertical stacks

Fix:

- centered text-only wrappers are now promoted to vertical render-first auto-layout stacks
- text children are attached through flow layout instead of a plain frame with manual child positioning

## Live batch stays queued forever or creates duplicate branches on repeated polls

Cause:

- plugin bridge previously returned the same queued batch on every `/commands/pending` poll
- long-running live batches could therefore be delivered multiple times before the first execution completed
- server restarts also dropped in-memory session/queue state, forcing a manual plugin reconnect

Fix:

- plugin bridge now uses dispatch leasing so one session can have only one active in-flight command delivery at a time
- queued commands are persisted in SQLite and recovered after gateway restart
- stale dispatched commands are re-queued automatically after lease expiry

## Inline-flex badge or link keeps the icon but loses text

Cause:

- the render-first extractor preserved the SVG child but dropped the container text for icon+text inline containers
- planner then created only the icon branch

Fix:

- extractor now keeps direct text for inline icon containers with icon-only children
- planner synthesizes a text label child for frame/group containers that have own text plus icon-only children

## Grid feature cards lose hierarchy and look flattened

Cause:

- the render-first planner treated some grid wrappers as plain frames instead of a wrapping layout container

Fix:

- planner now reconstructs eligible grid wrappers as wrapping auto-layout containers
- this keeps feature-card groups under a stable parent hierarchy instead of relying on flat absolute positioning

## Second grid section still looks flat even after grid wrapper reconstruction

Cause:

- the outer grid wrapper was reconstructed correctly
- but an inner transparent text-stack item wrapper was still treated as a skippable text-only wrapper
- planner then attached its text children directly to the grid parent

Fix:

- transparent text-only wrapper skipping now excludes real layout containers (`flex`, `inline-flex`, `grid`)
- nested text-stack item wrappers stay as their own frames and preserve grid item hierarchy
