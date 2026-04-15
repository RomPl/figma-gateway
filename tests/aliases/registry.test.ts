import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { AliasRegistry, createAliasService } from '../../src/core/alias-registry';
import { createFigmaGatewayService } from '../../src/core/figma-gateway-service';
import { migrateDatabase } from '../../src/db/migrate';
import { seedAliasRegistry } from '../../src/db/seed';
import { createSqliteDatabase } from '../../src/db/sqlite';
import type { FigmaReadClient } from '../../src/core/figma-client';

const createMockGatewayService = () => {
  const figmaClient: FigmaReadClient = {
    getFile: async () => ({
      document: {
        id: '0:1',
        name: 'Document',
        type: 'DOCUMENT'
      }
    }),
    getNode: async (_fileKey, nodeId) => ({
      document: {
        id: nodeId,
        name: 'Resolved Node',
        type: 'FRAME'
      }
    }),
    getNodes: async () => ({}),
    getImages: async () => ({ images: {} }),
    getStyles: async () => ({ status: 200, error: false, meta: { styles: [] } }),
    getComponents: async () => ({ status: 200, error: false, meta: { components: [] } }),
    getComponentSets: async () => ({ status: 200, error: false, meta: { component_sets: [] } }),
    getVariables: async () => ({ status: 200, error: false, meta: { variables: {}, variableCollections: {} } })
  };

  return createFigmaGatewayService(figmaClient);
};

test('alias registry upserts, resolves and searches aliases', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'figma-alias-registry-'));
  const dbPath = join(dir, 'registry.sqlite');

  try {
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);

    const registry = new AliasRegistry(db);

    const created = registry.upsert({
      alias: 'hero-primary',
      fileKey: 'file-1',
      nodeId: '1:2',
      project: 'marketing-site',
      tags: ['hero', 'primary'],
      description: 'Hero block'
    });

    assert.equal(created.alias, 'hero-primary');
    assert.equal(created.project, 'marketing-site');

    const updated = registry.upsert({
      alias: 'hero-primary',
      fileKey: 'file-1',
      nodeId: '1:9',
      project: 'marketing-site',
      tags: ['hero', 'updated'],
      description: 'Updated hero block'
    });

    assert.equal(updated.nodeId, '1:9');
    assert.deepEqual(updated.tags, ['hero', 'updated']);

    const resolved = registry.resolve({ alias: 'hero-primary' });
    assert.equal(resolved.description, 'Updated hero block');

    const matches = registry.search({ query: 'hero', tags: ['updated'], limit: 10 });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].alias, 'hero-primary');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('alias registry seed inserts example records into empty database', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'figma-alias-seed-'));
  const dbPath = join(dir, 'registry.sqlite');

  try {
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);

    const inserted = seedAliasRegistry(db);
    assert.equal(inserted, 2);

    const registry = new AliasRegistry(db);
    assert.equal(registry.list({ limit: 10 }).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('alias service resolves design block through existing figma gateway service', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'figma-alias-service-'));
  const dbPath = join(dir, 'registry.sqlite');

  try {
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);

    const registry = new AliasRegistry(db);
    registry.upsert({
      alias: 'hero-primary',
      fileKey: 'file-1',
      nodeId: '1:2',
      project: 'marketing-site',
      tags: ['hero']
    });

    const aliasService = createAliasService(registry, createMockGatewayService());
    const result = await aliasService.getDesignBlock({ alias: 'hero-primary' });

    assert.equal(result.alias.alias, 'hero-primary');
    assert.equal(result.node?.document?.id, '1:2');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
