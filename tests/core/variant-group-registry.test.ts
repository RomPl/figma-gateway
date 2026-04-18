import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { UiMappingRegistry } from '../../src/core/ui-mapping-registry';
import { VariantGroupRegistry } from '../../src/core/variant-group-registry';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';

test('variant group registry derives logical groups from mapping snapshots', () => {
  const dir = mkdtempSync(join(tmpdir(), 'variant-group-registry-'));
  try {
    const db = createSqliteDatabase(join(dir, 'db.sqlite'));
    migrateDatabase(db);
    const mappings = new UiMappingRegistry(db);
    mappings.upsert({ uiId: 'landing.hero', project: 'marketing-site', code: { file: 'src/Hero.tsx', component: 'Hero', snapshot: { kind: 'section', uiId: 'landing.hero--desktop', visible: true, meta: { breakpointVariantSet: { variantGroupId: 'landing.hero' }, breakpointVariantRef: { originalUiId: 'landing.hero', variantUiId: 'landing.hero--desktop', breakpointFamily: 'desktop' } } } }, figma: { fileKey: 'abc123', nodeId: '1:2', snapshot: { kind: 'section', uiId: 'landing.hero--desktop', visible: true } }, sync: { lastDirection: 'code_to_figma' } });
    mappings.upsert({ uiId: 'landing.hero.mobile', project: 'marketing-site', code: { file: 'src/Hero.tsx', component: 'Hero', snapshot: { kind: 'section', uiId: 'landing.hero--mobile', visible: true, meta: { breakpointVariantSet: { variantGroupId: 'landing.hero' }, breakpointVariantRef: { originalUiId: 'landing.hero', variantUiId: 'landing.hero--mobile', breakpointFamily: 'mobile' } } } }, figma: { fileKey: 'abc123', nodeId: '1:3', snapshot: { kind: 'section', uiId: 'landing.hero--mobile', visible: true } }, sync: { lastDirection: 'code_to_figma' } });
    const registry = new VariantGroupRegistry({ listUiMappings: (input) => mappings.list(input), searchUiMappings: (input) => mappings.search(input) } as any);
    const groups = registry.list({ project: 'marketing-site' });
    assert.equal(groups[0].variantGroupId, 'landing.hero');
    assert.equal(groups[0].variantUiIdsByBreakpoint.desktop, 'landing.hero--desktop');
    assert.equal(groups[0].variantUiIdsByBreakpoint.mobile, 'landing.hero--mobile');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
