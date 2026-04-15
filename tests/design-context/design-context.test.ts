import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createDesignContextService } from '../../src/core/design-context';
import type { FigmaReadClient } from '../../src/core/figma-client';

const fixturePath = (name: string) => join(process.cwd(), 'tests/design-context/fixtures', name);

const loadJsonFixture = <T>(name: string): T =>
  JSON.parse(readFileSync(fixturePath(name), 'utf8')) as T;

const createMockClient = (): FigmaReadClient => ({
  getFile: async () => ({
    name: 'Marketing Site',
    document: {
      id: '0:1',
      name: 'Document',
      type: 'DOCUMENT'
    },
    styles: {
      'S:1': {
        key: 'style-fill',
        file_key: 'file-1',
        node_id: 'S:1',
        style_type: 'FILL',
        name: 'Surface / Hero Background'
      },
      'S:2': {
        key: 'style-text',
        file_key: 'file-1',
        node_id: 'S:2',
        style_type: 'TEXT',
        name: 'Heading / XL'
      }
    },
    components: {
      'C:1': {
        key: 'component-cta',
        file_key: 'file-1',
        node_id: 'C:1',
        name: 'Button / Primary',
        description: 'Primary call to action button'
      }
    },
    componentSets: {
      'CS:1': {
        key: 'component-set-card',
        file_key: 'file-1',
        node_id: 'CS:1',
        name: 'Card / Feature',
        description: 'Feature card variants'
      }
    }
  }),
  getNode: async () => ({
    document: {
      id: '10:20',
      name: 'Hero Section',
      type: 'FRAME',
      visible: true,
      layoutMode: 'VERTICAL',
      primaryAxisSizingMode: 'AUTO',
      counterAxisSizingMode: 'FIXED',
      itemSpacing: 24,
      paddingTop: 64,
      paddingRight: 64,
      paddingBottom: 64,
      paddingLeft: 64,
      counterAxisAlignItems: 'CENTER',
      clipsContent: true,
      absoluteBoundingBox: {
        x: 0,
        y: 0,
        width: 1440,
        height: 900
      },
      styles: {
        fill: 'S:1'
      },
      boundVariables: {
        fills: [{ id: 'V:1' }],
        paddingLeft: { id: 'V:2' }
      },
      children: [
        {
          id: '10:21',
          name: 'Hero Heading',
          type: 'TEXT',
          characters: 'Build design systems faster',
          styles: {
            text: 'S:2'
          },
          boundVariables: {
            characters: { id: 'V:3' }
          }
        },
        {
          id: '10:22',
          name: 'Primary CTA',
          type: 'INSTANCE',
          componentId: 'C:1',
          characters: 'Get Started'
        },
        {
          id: '10:23',
          name: 'Feature Card',
          type: 'INSTANCE',
          componentSetId: 'CS:1',
          children: [
            {
              id: '10:24',
              name: 'Feature Card Text',
              type: 'TEXT',
              characters: 'Reusable production-ready blocks'
            }
          ]
        }
      ]
    }
  }),
  getNodes: async () => ({}),
  getImages: async () => ({ images: {} }),
  getStyles: async () => ({
    status: 200,
    error: false,
    meta: {
      styles: [
        {
          key: 'style-fill',
          file_key: 'file-1',
          node_id: 'S:1',
          style_type: 'FILL',
          name: 'Surface / Hero Background'
        },
        {
          key: 'style-text',
          file_key: 'file-1',
          node_id: 'S:2',
          style_type: 'TEXT',
          name: 'Heading / XL'
        }
      ]
    }
  }),
  getComponents: async () => ({
    status: 200,
    error: false,
    meta: {
      components: [
        {
          key: 'component-cta',
          file_key: 'file-1',
          node_id: 'C:1',
          name: 'Button / Primary',
          description: 'Primary call to action button'
        }
      ]
    }
  }),
  getComponentSets: async () => ({
    status: 200,
    error: false,
    meta: {
      component_sets: [
        {
          key: 'component-set-card',
          file_key: 'file-1',
          node_id: 'CS:1',
          name: 'Card / Feature',
          description: 'Feature card variants'
        }
      ]
    }
  }),
  getVariables: async () => ({
    status: 200,
    error: false,
    meta: {
      variables: {
        'V:1': {
          id: 'V:1',
          name: 'color/hero/background',
          key: 'var-1',
          variableCollectionId: 'VC:1',
          resolvedType: 'COLOR',
          valuesByMode: {},
          remote: false
        },
        'V:2': {
          id: 'V:2',
          name: 'space/page/gutter',
          key: 'var-2',
          variableCollectionId: 'VC:1',
          resolvedType: 'FLOAT',
          valuesByMode: {},
          remote: false
        },
        'V:3': {
          id: 'V:3',
          name: 'content/hero/title',
          key: 'var-3',
          variableCollectionId: 'VC:2',
          resolvedType: 'STRING',
          valuesByMode: {},
          remote: false
        }
      },
      variableCollections: {
        'VC:1': {
          id: 'VC:1',
          name: 'Primitives',
          key: 'collection-1'
        },
        'VC:2': {
          id: 'VC:2',
          name: 'Content',
          key: 'collection-2'
        }
      }
    }
  })
});

test('getDesignContext returns compact implementation snapshot', async () => {
  const service = createDesignContextService(createMockClient());

  const context = await service.getDesignContext({
    fileKey: 'file-1',
    nodeId: '10:20'
  });

  assert.deepEqual(context, loadJsonFixture('design-context.snapshot.json'));
});

test('getLayoutSummary returns compact layout snapshot', async () => {
  const service = createDesignContextService(createMockClient());

  const context = await service.getLayoutSummary({
    fileKey: 'file-1',
    nodeId: '10:20'
  });

  assert.deepEqual(context, loadJsonFixture('layout-summary.snapshot.json'));
});
