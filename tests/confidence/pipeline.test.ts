import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CodeUiParserService } from '../../src/core/code-ui-parser';
import { CodeToFigmaPipelineService } from '../../src/core/code-to-figma-pipeline';
import { PluginBridgeService } from '../../src/core/plugin-bridge';
import { RenderedUiExtractorService, type RenderedUiRuntime } from '../../src/core/rendered-ui-extractor';
import { RenderedToCodeMapperService } from '../../src/core/rendered-to-code-mapper';
import { UiMappingRegistry, createUiMappingService } from '../../src/core/ui-mapping-registry';
import { migrateDatabase } from '../../src/db/migrate';
import { createSqliteDatabase } from '../../src/db/sqlite';

const lowConfidenceRuntime: RenderedUiRuntime = {
  capture: async () => ({
    uiId: 'landing.hero', tag: 'section', text: 'Hero', treePath: 'landing.hero', clientRect: { x: 0, y: 0, width: 0, height: 0 },
    computedStyle: {}, visibility: { visible: false, display: 'none', visibility: 'hidden', opacity: 0 }, media: {}, asset: {}, icon: {}, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [],
    children: [
      { uiId: 'landing.hero.icon', tag: 'svg', text: undefined, treePath: 'landing.hero > landing.hero.icon', clientRect: { x: 0, y: 0, width: 0, height: 0 }, computedStyle: {}, visibility: { visible: false, display: 'none', visibility: 'hidden', opacity: 0 }, media: { kind: 'svg', inlineSvg: true, iconRole: 'leading', contentRole: 'content' }, asset: { layer: 'svg-icon', role: 'content' }, icon: { sourceType: 'inline-svg', textLabel: 'Arrow' }, semantics: {}, breakpoint: { viewportWidth: 1440, viewportHeight: 900, name: 'desktop' }, syncRelevantFields: [], children: [] }
    ]
  })
};

test('low visual confidence marks nodes as needs review and avoids complex figma asset creation', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'visual-confidence-'));
  const dbPath = join(rootDir, 'confidence.sqlite');
  try {
    mkdirSync(join(rootDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'components', 'Hero.tsx'), `
      import React from 'react';
      export function Hero() {
        return (
          <section data-ui-id="landing.hero">
            <div data-ui-id="landing.hero.icon" />
          </section>
        );
      }
    `, 'utf8');
    const db = createSqliteDatabase(dbPath);
    migrateDatabase(db);
    const code = new CodeUiParserService({ rootDir });
    const extractor = new RenderedUiExtractorService(lowConfidenceRuntime);
    const pipeline = new CodeToFigmaPipelineService(code, new RenderedToCodeMapperService(extractor, code), new PluginBridgeService(), createUiMappingService(new UiMappingRegistry(db)));
    const result = await pipeline.run({ project: 'marketing-site', rootDir, componentName: 'Hero', dryRun: true, render: { target: { mode: 'existing_url', url: 'http://127.0.0.1:3000' }, rootUiId: 'landing.hero', breakpoint: 'desktop' } });
    assert.equal(result.needsReview.length >= 1, true);
    assert.equal(result.needsReview.some((item) => item.uiId === 'landing.hero.icon'), true);
    const iconRef = result.plan.commands.find((item) => item.type === 'set_icon_reference') as any;
    assert.equal(Boolean(iconRef), true);
    assert.equal(iconRef.payload.figmaStrategy, 'placeholder');
    assert.equal(result.plan.commands.some((item) => item.type === 'set_plugin_data'), true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
