import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CodeUiParserService } from '../../src/core/code-ui-parser';
import { DesignTokenRegistry, createDesignTokenService } from '../../src/core/design-token-registry';
import { FigmaUiExtractorService } from '../../src/core/figma-ui-extractor';
import type { FigmaReadClient } from '../../src/core/figma-client';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';

const createMockClient = (): FigmaReadClient => ({
  getFile: async () => ({
    document: {
      id: '0:1',
      name: 'Page 1',
      type: 'CANVAS',
      children: [{
        id: '12:45',
        name: 'Hero',
        type: 'SECTION',
        visible: true,
        fills: [{ type: 'SOLID', color: { r: 0.149, g: 0.373, b: 0.878 }, opacity: 1 }],
        cornerRadius: 16,
        itemSpacing: 24,
        children: [{ id: '12:46', name: 'Hero Title', type: 'TEXT', visible: true, characters: 'Build faster', fontSize: 48, textAlignHorizontal: 'CENTER' }]
      }]
    }
  }),
  getNode: async (_fileKey, nodeId) => ({ document: { id: nodeId, name: 'Node', type: 'FRAME' } }),
  getNodes: async () => ({}),
  getImages: async () => ({ images: {} }),
  getStyles: async () => ({ status: 200, error: false, meta: { styles: [] } }),
  getComponents: async () => ({ status: 200, error: false, meta: { components: [] } }),
  getComponentSets: async () => ({ status: 200, error: false, meta: { component_sets: [] } }),
  getVariables: async () => ({ status: 200, error: false, meta: { variables: {}, variableCollections: {} } })
});

test('code and figma ui models carry token references after normalization', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'token-integration-'));
  const dbPath = join(rootDir, 'tokens.sqlite');
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Hero.tsx'), `
      import React from 'react';
      export function Hero() {
        return <section data-ui-id="landing.hero" className="flex flex-col gap-6 rounded-lg bg-brand-primary"><h1 data-ui-id="landing.hero.title" className="text-5xl">Build faster</h1></section>;
      }
    `, 'utf8');
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const service = createDesignTokenService(new DesignTokenRegistry(db));
    service.upsertDesignToken({ token: 'color.brand.primary', type: 'colors', project: 'marketing-site', value: { raw: '#265fe0', tailwind: 'bg-brand-primary' }, code: { className: 'bg-brand-primary' }, figma: {}, tags: [] });
    service.upsertDesignToken({ token: 'space.24', type: 'spacing', project: 'marketing-site', value: { raw: '24', numeric: 24 }, code: { className: 'gap-6' }, figma: {}, tags: [] });
    service.upsertDesignToken({ token: 'radius.lg', type: 'radius', project: 'marketing-site', value: { raw: '16', numeric: 16 }, code: { className: 'rounded-lg' }, figma: {}, tags: [] });
    service.upsertDesignToken({ token: 'text.h1', type: 'typography', project: 'marketing-site', value: { raw: '48', numeric: 48 }, code: { className: 'text-5xl' }, figma: {}, tags: [] });

    const parser = new CodeUiParserService({ rootDir, designTokenService: service });
    const code = parser.parseProject({ project: 'marketing-site', componentName: 'Hero' });
    assert.equal(code.components[0].tree.root.tokens?.fill, 'color.brand.primary');
    assert.equal(code.components[0].tree.root.tokens?.spacing, 'space.24');
    assert.equal(code.components[0].tree.root.tokens?.radius, 'radius.lg');
    assert.equal(code.components[0].tree.root.children[0].tokens?.typography, 'text.h1');

    const extractor = new FigmaUiExtractorService(createMockClient(), service);
    const figma = await extractor.extract({ fileKey: 'abc123', project: 'marketing-site' });
    assert.equal(figma.root.children[0].tokens?.fill, 'color.brand.primary');
    assert.equal(figma.root.children[0].tokens?.spacing, 'space.24');
    assert.equal(figma.root.children[0].tokens?.radius, 'radius.lg');
    assert.equal(figma.root.children[0].children[0].tokens?.typography, 'text.h1');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
