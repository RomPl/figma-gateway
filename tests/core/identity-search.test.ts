import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { UiBlockRegistry } from '../../src/core/ui-block-registry';
import { UiMappingRegistry } from '../../src/core/ui-mapping-registry';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';

test('ui mapping search ranks block identity aliases from snapshots', () => {
  const dir = mkdtempSync(join(tmpdir(), 'identity-search-map-'));
  try {
    const db = createSqliteDatabase(join(dir, 'db.sqlite'));
    migrateDatabase(db);
    const registry = new UiMappingRegistry(db);
    registry.upsert({
      uiId: 'landing.hero',
      project: 'marketing-site',
      semanticRole: 'headline',
      code: { file: 'src/Hero.tsx', component: 'Hero', snapshot: { kind: 'section', uiId: 'landing.hero', visible: true, meta: { blockIdentity: { blockId: 'landing.hero', aliases: ['hero.primary', 'landing.hero.main'], semanticName: 'hero.primary', identitySource: 'stable_ui_id', stable: true } } } },
      figma: { fileKey: 'abc123', nodeId: '1:2', snapshot: { kind: 'section', uiId: 'landing.hero', visible: true } },
      sync: { lastDirection: 'code_to_figma' }
    });
    const results = registry.search({ query: 'hero.primary', limit: 5 });
    assert.equal(results[0].uiId, 'landing.hero');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ui block search ranks block identity aliases from metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'identity-search-block-'));
  try {
    const db = createSqliteDatabase(join(dir, 'db.sqlite'));
    migrateDatabase(db);
    const registry = new UiBlockRegistry(db);
    registry.upsert({
      uiId: 'landing.hero',
      project: 'marketing-site',
      codeMarkerType: 'data-ui-id',
      figmaBindingType: 'plugin-data',
      figmaBindingKey: 'figma-gateway.ui-id',
      metadata: { blockIdentity: { blockId: 'landing.hero', aliases: ['hero.primary', 'landing.hero.main'], semanticName: 'hero.primary', identitySource: 'stable_ui_id', stable: true } }
    });
    const results = registry.search({ query: 'hero.primary', limit: 5 });
    assert.equal(results[0].uiId, 'landing.hero');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
