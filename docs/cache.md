# Cache Layer

Gateway uses a read-through cache above `FigmaReadClient`. This keeps cache logic out of REST routes, MCP tools, alias registry, and design-context service.

## What is cached

- `files`
- `nodes`
- `styles`
- `components`
- `component-sets`
- `variables`
- `render-links`

## Default backend

Default backend is in-memory and process-local. It is enabled automatically in both HTTP and MCP entrypoints.

The backend contract is defined in [src/core/cache.ts](/home/figma-gateway.vazovski.art/src/core/cache.ts) and is intentionally small so a Redis backend can be added later without changing service code.

## TTL configuration

All TTL values come only from env:

- `CACHE_TTL_FILES_MS`
- `CACHE_TTL_NODES_MS`
- `CACHE_TTL_STYLES_MS`
- `CACHE_TTL_COMPONENTS_MS`
- `CACHE_TTL_COMPONENT_SETS_MS`
- `CACHE_TTL_VARIABLES_MS`
- `CACHE_TTL_RENDER_LINKS_MS`

## Metrics

The cache records:

- `hits`
- `misses`
- `sets`
- `deletes`
- `clears`

Metrics are available per namespace and in total through `figmaCache.getMetrics()`.

## Manual invalidation

Manual invalidation is available through the cache instance:

```ts
await app.locals.figmaCache.invalidate({ fileKey: 'abc123' });
await app.locals.figmaCache.invalidate({ namespace: 'nodes', fileKey: 'abc123', nodeId: '1:2' });
await app.locals.figmaCache.clear();
```

Use cases:

- invalidate one file after a known design update
- invalidate one node after targeted refresh
- clear all cache during maintenance or rollout

## Current limitations

- In-memory backend is per-process only
- metrics reset on process restart
- manual invalidation is internal for now; no public admin endpoint was added
