import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { UiMappingRegistry } from '../../src/core/ui-mapping-registry';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';

test('ui mapping search can match deferred variant group ids from snapshot metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'variant-group-search-'));
  try {
    const db = createSqliteDatabase(join(dir, 'db.sqlite'));
    migrateDatabase(db);
    const registry = new UiMappingRegistry(db);
    registry.upsert({
      uiId: 'landing.hero',
      project: 'marketing-site',
      code: { file: 'src/Hero.tsx', component: 'Hero', snapshot: { kind: 'section', uiId: 'landing.hero--desktop', visible: true, meta: { breakpointVariantSet: { variantGroupId: 'landing.hero' }, breakpointVariantRef: { originalUiId: 'landing.hero', variantUiId: 'landing.hero--desktop', breakpointFamily: 'desktop' } } } },
      figma: { fileKey: 'abc123', nodeId: '1:2', snapshot: { kind: 'section', uiId: 'landing.hero--desktop', visible: true } },
      sync: { lastDirection: 'code_to_figma' }
    });
    const results = registry.search({ query: 'landing.hero--desktop', limit: 5 });
    assert.equal(results[0].uiId, 'landing.hero');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
