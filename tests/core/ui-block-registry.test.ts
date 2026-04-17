import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { UiBlockRegistry } from '../../src/core/ui-block-registry';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';

test('ui block registry upserts, resolves, lists and searches tagged records', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ui-block-registry-'));
  const db = createSqliteDatabase(join(rootDir, 'ui-blocks.sqlite'));
  migrateDatabase(db);
  const registry = new UiBlockRegistry(db);
  try {
    registry.upsert({
      uiId: 'landing.hero',
      project: 'marketing-site',
      fileKey: 'abc123',
      nodeId: '12:45',
      codePath: 'src/components/Landing.tsx',
      codeExportName: 'Landing',
      name: 'Hero',
      description: 'Main hero section',
      tags: ['hero', 'marketing'],
      metadata: { priority: 'high' }
    });
    registry.upsert({
      uiId: 'landing.footer',
      project: 'marketing-site',
      fileKey: 'abc123',
      nodeId: '12:47',
      codePath: 'src/components/Landing.tsx',
      name: 'Footer',
      tags: ['footer'],
      metadata: {}
    });

    const hero = registry.resolve({ uiId: 'landing.hero' });
    assert.equal(hero.name, 'Hero');
    assert.equal(hero.tags.includes('marketing'), true);

    const listed = registry.list({ project: 'marketing-site', tag: 'hero', limit: 10 });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].uiId, 'landing.hero');

    const searched = registry.search({ query: 'Main hero', project: 'marketing-site', tags: ['hero'], limit: 10 });
    assert.equal(searched.length, 1);
    assert.equal(searched[0].uiId, 'landing.hero');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
