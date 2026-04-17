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
