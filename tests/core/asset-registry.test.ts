import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AssetRegistry, createAssetRegistryService, inferAssetHash, inferAssetId, inferFigmaAssetStrategy } from '../../src/core/asset-registry';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';

test('asset registry infers stable hash, id and figma strategy', () => {
  const hash = inferAssetHash({ assetKind: 'image', sourcePath: '/hero.png', width: 320, height: 240, role: 'content' });
  assert.equal(hash.length, 64);
  assert.equal(inferAssetId('marketing-site', 'landing.hero.image', hash), `marketing-site:landing.hero.image:${hash.slice(0, 16)}`);
  assert.equal(inferFigmaAssetStrategy({ assetKind: 'image' }), 'image_fill');
  assert.equal(inferFigmaAssetStrategy({ assetKind: 'icon' }), 'vector_icon');
  assert.equal(inferFigmaAssetStrategy({ assetKind: 'placeholder' }), 'placeholder');
});

test('asset registry upserts, resolves and filters records', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'asset-registry-'));
  const db = createSqliteDatabase(join(rootDir, 'assets.sqlite'));
  migrateDatabase(db);
  const registry = new AssetRegistry(db);
  try {
    const hash = inferAssetHash({ assetKind: 'image', sourcePath: '/hero.png' });
    const assetId = inferAssetId('marketing-site', 'landing.hero.image', hash);
    const created = registry.upsert({
      assetId,
      project: 'marketing-site',
      uiId: 'landing.hero.image',
      assetKind: 'image',
      sourcePath: '/hero.png',
      resolvedUrl: 'https://cdn.example/hero.png',
      hash,
      width: 320,
      height: 240,
      role: 'content',
      figmaStrategy: 'image_fill',
      metadata: { alt: 'Hero image' }
    });
    assert.equal(created.metadata.alt, 'Hero image');

    const updated = registry.upsert({ ...created, width: 640, metadata: { alt: 'Hero image', variant: '2x' } });
    assert.equal(updated.width, 640);
    assert.equal(updated.metadata.variant, '2x');

    const filtered = registry.list({ project: 'marketing-site', uiId: 'landing.hero.image', assetKind: 'image', limit: 10 });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].assetId, assetId);

    const service = createAssetRegistryService(registry);
    assert.equal(service.resolveAsset({ assetId }).width, 640);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
