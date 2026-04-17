# Browser renderer

## Purpose

Browser renderer is the runtime layer that opens a real page in Playwright and returns a live browser page to higher-level extractors.

It exists so the system can render HTML/CSS as a running UI, not as static source text.

## Supported target modes

### 1. `existing_url`

Use an already running app URL.

Best when:

- a dev server already exists
- a staging page already exists
- the target project is managed outside this service

### 2. `preview_build`

Run a controlled local build command, then start a local preview server.

Best when:

- the project supports `build` and `preview`
- a reproducible static or SSR preview exists

### 3. `controlled_local_runner`

Run a controlled local start command in a project directory and wait until the page is ready.

Best when:

- a project needs its own local runtime
- preview mode is unavailable
- a managed dev-like startup is needed

## Stability waiting

Browser renderer supports staged waiting:

- `domcontentloaded`
- `load`
- `networkidle`
- optional hydration marker via `hydrationSelector`
- optional additional settle delay via `waitForMs`

This allows the server to wait not only for HTML delivery, but for a stable rendered UI baseline.

## Safety limits

The renderer uses bounded runtime controls:

- headless browser by default
- bounded viewport sizes
- navigation timeout
- action timeout
- startup timeout for local runners
- shutdown timeout for local runners
- capped stdout/stderr capture for local runners
- one browser context per render session
- automatic cleanup of browser and spawned processes

## API

### Open page

`POST /api/rendered-ui/open-page`

This opens the page using the selected target mode and returns live page metadata.

### Extract rendered UI

`POST /api/rendered-ui/extract`

This uses the same browser renderer layer, then extracts DOM/CSS state into Unified UI Model.

## Production browser runtime requirement

For live rendered extraction on the server, Playwright browser binaries must exist for the same runtime user that runs `figma-gateway.service`.

Current production service facts:

- service user: `figma5001`
- working directory: `/home/figma-gateway.vazovski.art`
- writable project cache path: `/home/figma-gateway.vazovski.art/.cache/ms-playwright`

Recommended install command:

```bash
cd /home/figma-gateway.vazovski.art
mkdir -p /home/figma-gateway.vazovski.art/.cache/ms-playwright
chown -R figma5001:figma5001 /home/figma-gateway.vazovski.art/.cache
runuser -u figma5001 -- env HOME=/home/figma-gateway.vazovski.art PLAYWRIGHT_BROWSERS_PATH=/home/figma-gateway.vazovski.art/.cache/ms-playwright npx playwright install chromium
```

If browsers are installed only under another user cache, the service may still fail to launch Playwright even though `npx playwright install` succeeded elsewhere.
