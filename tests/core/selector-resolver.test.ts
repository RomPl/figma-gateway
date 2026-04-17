import assert from 'node:assert/strict';
import test from 'node:test';

import { SelectorResolverService } from '../../src/core/selector-resolver';
import type { UiModelDocument } from '../../src/core/ui-model';

const codeDocument: UiModelDocument = {
  version: 'ui-model.v1',
  root: {
    kind: 'page',
    uiId: 'landing.page',
    name: 'Landing',
    visible: true,
    children: [
      {
        kind: 'section',
        uiId: 'landing.hero',
        name: 'Hero',
        role: 'headline',
        visible: true,
        children: [
          { kind: 'text', uiId: 'landing.hero.title', name: 'Headline', text: 'Build faster', visible: true, children: [] },
          { kind: 'button', uiId: 'landing.hero.cta', name: 'Get started', role: 'button-primary', text: 'Get started', visible: true, children: [] }
        ]
      },
      {
        kind: 'section',
        uiId: 'landing.footer',
        name: 'Footer',
        visible: true,
        children: []
      }
    ]
  }
};

const figmaDocument: UiModelDocument = {
  version: 'ui-model.v1',
  root: {
    kind: 'page',
    uiId: 'figma.page',
    name: 'Landing page',
    visible: true,
    source: { fileKey: 'abc123', nodeId: '0:1' },
    children: [
      {
        kind: 'section',
        uiId: 'temporary.hero',
        name: 'Hero Section',
        visible: true,
        source: { fileKey: 'abc123', nodeId: '12:45' },
        children: [
          { kind: 'text', uiId: 'temporary.cta', name: 'CTA', text: 'Get started', visible: true, source: { fileKey: 'abc123', nodeId: '12:46' }, children: [] }
        ]
      }
    ]
  }
};

const createService = () => new SelectorResolverService(
  {
    parseProject: () => ({
      componentCount: 1,
      components: [{ componentName: 'Landing', filePath: 'src/components/Landing.tsx', tree: codeDocument }]
    })
  } as any,
  {
    extract: async () => figmaDocument
  } as any,
  {
    listUiMappings: () => [
      { uiId: 'landing.hero', figma: { fileKey: 'abc123', nodeId: '12:45' } },
      { uiId: 'landing.hero.cta', figma: { fileKey: 'abc123', nodeId: '12:46' } }
    ]
  } as any
);

test('selector resolver prefers exact uiId and partial name matches from code source', async () => {
  const result = await createService().resolve({ query: 'landing.hero', source: 'code', rootDir: '/tmp/project', project: 'marketing-site' });
  assert.equal(result.matches[0].uiId, 'landing.hero');
  assert.equal(result.matches[0].source, 'code');
  assert.equal(result.matches[0].kind.includes('uiId'), true);
});

test('selector resolver understands quoted button-text queries and button preference', async () => {
  const result = await createService().resolve({ query: 'button with text "Get started"', source: 'code', rootDir: '/tmp/project', project: 'marketing-site' });
  assert.equal(result.matches[0].uiId, 'landing.hero.cta');
  assert.equal(result.matches[0].kind.includes('text'), true);
  assert.equal(result.matches[0].reasons.some((reason) => reason.includes('Button role preference matched')), true);
});

test('selector resolver resolves fuzzy code matches and mapped figma uiIds independently', async () => {
  const fuzzy = await createService().resolve({ query: 'foter', source: 'both', rootDir: '/tmp/project', project: 'marketing-site', fileKey: 'abc123' });
  assert.equal(fuzzy.matches[0].uiId, 'landing.footer');
  assert.equal(fuzzy.matches[0].kind.includes('fuzzy'), true);

  const figma = await createService().resolve({ query: 'Hero Section', source: 'figma', rootDir: '/tmp/project', project: 'marketing-site', fileKey: 'abc123' });
  assert.equal(figma.matches[0].source, 'figma');
  assert.equal(figma.matches[0].uiId, 'landing.hero');
  assert.equal(figma.matches[0].kind.includes('node_name'), true);
});
