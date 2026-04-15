import type { FigmaReadClient } from './figma-client';
import type {
  FigmaComponentSetsResponse,
  FigmaComponentsResponse,
  FigmaFileNode,
  FigmaFileResponse,
  FigmaImageFormat,
  FigmaImagesResponse,
  FigmaStylesResponse,
  FigmaVariablesResponse
} from '../types/figma';

export const FIGMA_CACHE_NAMESPACES = [
  'files',
  'nodes',
  'styles',
  'components',
  'component-sets',
  'variables',
  'render-links'
] as const;

export type FigmaCacheNamespace = (typeof FIGMA_CACHE_NAMESPACES)[number];

export type CacheMetricsCounters = {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  clears: number;
};

export type CacheMetricsSnapshot = CacheMetricsCounters & {
  byNamespace: Record<FigmaCacheNamespace, CacheMetricsCounters>;
};

export type CacheBackend = {
  get<T>(key: string): T | undefined | Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): void | Promise<void>;
  delete(key: string): boolean | Promise<boolean>;
  clear(prefix?: string): number | Promise<number>;
};

export type FigmaCacheTtlConfig = Record<FigmaCacheNamespace, number>;

export type FigmaCacheInvalidationInput = {
  namespace?: FigmaCacheNamespace;
  fileKey?: string;
  nodeId?: string;
};

export type FigmaCache = {
  get<T>(namespace: FigmaCacheNamespace, key: string): Promise<T | undefined>;
  set<T>(namespace: FigmaCacheNamespace, key: string, value: T): Promise<void>;
  getOrSet<T>(namespace: FigmaCacheNamespace, key: string, loader: () => Promise<T>): Promise<T>;
  invalidate(input?: FigmaCacheInvalidationInput): Promise<number>;
  clear(): Promise<number>;
  getMetrics(): CacheMetricsSnapshot;
};

export type CachedFigmaReadClientResult = {
  client: FigmaReadClient;
  cache: FigmaCache;
};

const createCounters = (): CacheMetricsCounters => ({
  hits: 0,
  misses: 0,
  sets: 0,
  deletes: 0,
  clears: 0
});

const createEmptyMetrics = (): CacheMetricsSnapshot => ({
  ...createCounters(),
  byNamespace: {
    files: createCounters(),
    nodes: createCounters(),
    styles: createCounters(),
    components: createCounters(),
    'component-sets': createCounters(),
    variables: createCounters(),
    'render-links': createCounters()
  }
});

const incrementMetric = (
  metrics: CacheMetricsSnapshot,
  namespace: FigmaCacheNamespace,
  field: keyof CacheMetricsCounters,
  amount = 1
) => {
  metrics[field] += amount;
  metrics.byNamespace[namespace][field] += amount;
};

const escapeKeyPart = (value: string): string => encodeURIComponent(value.trim());

const buildStorageKey = (namespace: FigmaCacheNamespace, key: string): string =>
  `figma:${namespace}:${key}`;

const buildPrefix = (namespace: FigmaCacheNamespace, keyPrefix?: string): string =>
  keyPrefix ? `${buildStorageKey(namespace, keyPrefix)}` : `figma:${namespace}:`;

const cloneMetrics = (metrics: CacheMetricsSnapshot): CacheMetricsSnapshot =>
  JSON.parse(JSON.stringify(metrics)) as CacheMetricsSnapshot;

const nodeCacheKey = (fileKey: string, nodeId: string): string =>
  `${escapeKeyPart(fileKey)}:${escapeKeyPart(nodeId)}`;

const fileScopedCacheKey = (fileKey: string): string => escapeKeyPart(fileKey);

const renderCacheKey = (fileKey: string, nodeIds: string[], format: FigmaImageFormat): string =>
  `${escapeKeyPart(fileKey)}:${escapeKeyPart(format)}:${nodeIds.map(escapeKeyPart).sort().join(',')}`;

export const defaultFigmaCacheTtlConfig: FigmaCacheTtlConfig = {
  files: 300_000,
  nodes: 300_000,
  styles: 300_000,
  components: 300_000,
  'component-sets': 300_000,
  variables: 300_000,
  'render-links': 60_000
};

export const createFigmaCache = (
  backend: CacheBackend,
  ttlConfig: FigmaCacheTtlConfig = defaultFigmaCacheTtlConfig
): FigmaCache => {
  const metrics = createEmptyMetrics();

  return {
    async get<T>(namespace: FigmaCacheNamespace, key: string): Promise<T | undefined> {
      const value = await backend.get<T>(buildStorageKey(namespace, key));

      if (value === undefined) {
        incrementMetric(metrics, namespace, 'misses');
        return undefined;
      }

      incrementMetric(metrics, namespace, 'hits');
      return value;
    },
    async set<T>(namespace: FigmaCacheNamespace, key: string, value: T): Promise<void> {
      await backend.set(buildStorageKey(namespace, key), value, ttlConfig[namespace]);
      incrementMetric(metrics, namespace, 'sets');
    },
    async getOrSet<T>(
      namespace: FigmaCacheNamespace,
      key: string,
      loader: () => Promise<T>
    ): Promise<T> {
      const cached = await this.get<T>(namespace, key);
      if (cached !== undefined) {
        return cached;
      }

      const value = await loader();
      await this.set(namespace, key, value);
      return value;
    },
    async invalidate(input) {
      if (!input || Object.keys(input).length === 0) {
        return this.clear();
      }

      const namespaces = input.namespace ? [input.namespace] : FIGMA_CACHE_NAMESPACES;
      let deleted = 0;

      for (const namespace of namespaces) {
        const prefix = (() => {
          if (!input.fileKey) {
            return buildPrefix(namespace);
          }

          if (namespace === 'nodes' && input.nodeId) {
            return buildPrefix(namespace, nodeCacheKey(input.fileKey, input.nodeId));
          }

          if (namespace === 'nodes') {
            return buildPrefix(namespace, `${fileScopedCacheKey(input.fileKey)}:`);
          }

          return buildPrefix(namespace, fileScopedCacheKey(input.fileKey));
        })();

        const removed = await backend.clear(prefix);
        if (removed > 0) {
          incrementMetric(metrics, namespace, 'deletes', removed);
        }
        deleted += removed;
      }

      return deleted;
    },
    async clear() {
      let deleted = 0;

      for (const namespace of FIGMA_CACHE_NAMESPACES) {
        const removed = await backend.clear(buildPrefix(namespace));
        if (removed > 0) {
          incrementMetric(metrics, namespace, 'clears', removed);
        }
        deleted += removed;
      }

      return deleted;
    },
    getMetrics() {
      return cloneMetrics(metrics);
    }
  };
};

export const createCachedFigmaReadClient = (
  figmaClient: FigmaReadClient,
  options: {
    backend: CacheBackend;
    ttlConfig?: FigmaCacheTtlConfig;
  }
): CachedFigmaReadClientResult => {
  const cache = createFigmaCache(options.backend, options.ttlConfig);

  const client: FigmaReadClient = {
    getFile(fileKey: string): Promise<FigmaFileResponse> {
      return cache.getOrSet('files', fileScopedCacheKey(fileKey), () => figmaClient.getFile(fileKey));
    },
    getNode(fileKey: string, nodeId: string): Promise<FigmaFileNode | null> {
      return cache.getOrSet('nodes', nodeCacheKey(fileKey, nodeId), () =>
        figmaClient.getNode(fileKey, nodeId)
      );
    },
    async getNodes(fileKey: string, nodeIds: string[]): Promise<Record<string, FigmaFileNode | null>> {
      const results: Record<string, FigmaFileNode | null> = {};
      const missingNodeIds: string[] = [];

      for (const nodeId of nodeIds) {
        const key = nodeCacheKey(fileKey, nodeId);
        const cached = await cache.get<FigmaFileNode | null>('nodes', key);
        if (cached !== undefined) {
          results[nodeId] = cached;
          continue;
        }

        missingNodeIds.push(nodeId);
      }

      if (missingNodeIds.length > 0) {
        const upstream = await figmaClient.getNodes(fileKey, missingNodeIds);
        for (const [nodeId, value] of Object.entries(upstream)) {
          results[nodeId] = value;
          await cache.set('nodes', nodeCacheKey(fileKey, nodeId), value);
        }
      }

      return Object.fromEntries(nodeIds.map((nodeId) => [nodeId, results[nodeId] ?? null]));
    },
    getImages(fileKey: string, nodeIds: string[], format: FigmaImageFormat): Promise<FigmaImagesResponse> {
      return cache.getOrSet('render-links', renderCacheKey(fileKey, nodeIds, format), () =>
        figmaClient.getImages(fileKey, nodeIds, format)
      );
    },
    getStyles(fileKey: string): Promise<FigmaStylesResponse> {
      return cache.getOrSet('styles', fileScopedCacheKey(fileKey), () => figmaClient.getStyles(fileKey));
    },
    getComponents(fileKey: string): Promise<FigmaComponentsResponse> {
      return cache.getOrSet('components', fileScopedCacheKey(fileKey), () =>
        figmaClient.getComponents(fileKey)
      );
    },
    getComponentSets(fileKey: string): Promise<FigmaComponentSetsResponse> {
      return cache.getOrSet('component-sets', fileScopedCacheKey(fileKey), () =>
        figmaClient.getComponentSets(fileKey)
      );
    },
    getVariables(fileKey: string): Promise<FigmaVariablesResponse> {
      return cache.getOrSet('variables', fileScopedCacheKey(fileKey), () =>
        figmaClient.getVariables(fileKey)
      );
    }
  };

  return {
    client,
    cache
  };
};
