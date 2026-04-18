import assert from 'node:assert/strict';
import test from 'node:test';

import { annotateDocumentWithTokens } from '../../src/core/design-token-helpers';
import { createSqliteDatabase } from '../../src/db/sqlite';
import { migrateDatabase } from '../../src/db/migrate';
import { DesignTokenRegistry, createDesignTokenService } from '../../src/core/design-token-registry';
import { uiModelDocumentSchema } from '../../src/core/ui-model';

test('rendered layer resolves semantic tokens from computed values with confidence and code/figma mapping', () => {
  const db = createSqliteDatabase(':memory:');
  migrateDatabase(db);
  const service = createDesignTokenService(new DesignTokenRegistry(db));

  service.upsertDesignToken({
    token: 'color.brand.primary',
    type: 'colors',
    project: 'marketing-site',
    value: { raw: '#265fe0', cssVar: '--color-brand-primary', tailwind: 'bg-brand-primary' },
    code: { className: 'bg-brand-primary', cssVar: '--color-brand-primary', tokenSource: 'tailwind-theme' },
    figma: { variableId: 'VariableID:10:20', name: 'Brand / Primary' },
    tags: []
  });
  service.upsertDesignToken({
    token: 'space.6',
    type: 'spacing',
    project: 'marketing-site',
    value: { raw: '24', numeric: 24, unit: 'px', tailwind: 'gap-6' },
    code: { className: 'gap-6', tokenSource: 'tailwind-theme' },
    figma: { variableId: 'VariableID:20:30', name: 'Spacing / 24' },
    tags: []
  });
  service.upsertDesignToken({
    token: 'radius.lg',
    type: 'radius',
    project: 'marketing-site',
    value: { raw: '12', numeric: 12, unit: 'px', tailwind: 'rounded-xl' },
    code: { className: 'rounded-xl', tokenSource: 'tailwind-theme' },
    figma: { variableId: 'VariableID:30:40', name: 'Radius / Large' },
    tags: []
  });
  service.upsertDesignToken({
    token: 'text.display.lg',
    type: 'typography',
    project: 'marketing-site',
    value: { raw: '56', numeric: 56, unit: 'px' },
    code: { stylePath: 'theme.fontSize.6xl', tokenSource: 'theme' },
    figma: { styleId: 'S:1:1', name: 'Display / Large' },
    tags: []
  });
  service.upsertDesignToken({
    token: 'shadow.card.md',
    type: 'shadows',
    project: 'marketing-site',
    value: { raw: 'rgba(0, 0, 0, 0.1) 0px 10px 30px 0px' },
    code: { className: 'shadow-card-md', tokenSource: 'theme' },
    figma: { styleId: 'S:2:2', name: 'Shadow / Card / Medium' },
    tags: []
  });
  service.upsertDesignToken({
    token: 'breakpoint.desktop',
    type: 'breakpoints',
    project: 'marketing-site',
    value: { raw: '1440', numeric: 1440, unit: 'px' },
    code: { className: 'xl:', tokenSource: 'tailwind-theme' },
    figma: { variableId: 'VariableID:50:60', name: 'Breakpoint / Desktop' },
    tags: []
  });

  const document = uiModelDocumentSchema.parse({
    version: 'ui-model.v1',
    root: {
      kind: 'button',
      uiId: 'landing.hero.cta',
      visible: true,
      text: 'Start',
      computedStyle: {
        backgroundColor: 'rgb(38, 95, 224)',
        gap: 24,
        borderRadius: 12,
        fontSize: 56,
        boxShadow: 'rgba(0, 0, 0, 0.1) 0px 10px 30px 0px'
      },
      responsive: {
        viewportWidth: 1440,
        breakpointName: 'desktop'
      },
      children: []
    }
  });

  const annotated = annotateDocumentWithTokens(document, service, 'marketing-site');
  const node = annotated.root;

  assert.equal(node.semanticTokens?.fill, 'color.brand.primary');
  assert.equal(node.semanticTokens?.spacing, 'space.6');
  assert.equal(node.semanticTokens?.radius, 'radius.lg');
  assert.equal(node.semanticTokens?.typography, 'text.display.lg');
  assert.equal(node.semanticTokens?.shadow, 'shadow.card.md');
  assert.equal(node.semanticTokens?.breakpoint, 'breakpoint.desktop');

  const bindings = node.meta?.tokenBindings as any;
  assert.equal(bindings.fill.raw, '#265fe0');
  assert.equal(bindings.fill.matchedToken, 'color.brand.primary');
  assert.equal(bindings.fill.confidence, 1);
  assert.equal(bindings.fill.code.cssVar, '--color-brand-primary');
  assert.equal(bindings.fill.figma.variableId, 'VariableID:10:20');
  assert.equal(bindings.spacing.matchedToken, 'space.6');
  assert.equal(bindings.radius.matchedToken, 'radius.lg');
  assert.equal(bindings.typography.matchedToken, 'text.display.lg');
  assert.equal(bindings.shadow.matchedToken, 'shadow.card.md');
  assert.equal(bindings.breakpoint.matchedToken, 'breakpoint.desktop');
});
