import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CodeConnectRegistry } from '../../src/core/code-connect-registry';

test('code connect registry loads json mappings, searches and summarizes catalog', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'code-connect-'));
  const mappingsDir = join(rootDir, 'mappings');
  mkdirSync(join(mappingsDir, 'nested'), { recursive: true });
  try {
    writeFileSync(join(mappingsDir, 'button.json'), JSON.stringify({
      id: 'button-primary',
      figma: { fileKey: 'abc123', nodeId: '1:2', componentKey: 'cmp_btn', name: 'Button/Primary' },
      code: { repository: 'web', path: 'src/components/Button.tsx', exportName: 'Button', framework: 'React', language: 'TypeScript', examples: ['primary'] },
      tags: ['button'],
      notes: ['primary action'],
      owners: ['design-systems'],
      updatedAt: '2026-04-17T00:00:00Z'
    }, null, 2));
    writeFileSync(join(mappingsDir, 'nested', 'card.json'), JSON.stringify([{
      id: 'card-default',
      figma: { fileKey: 'abc123', nodeId: '1:3', componentKey: 'cmp_card', name: 'Card/Default' },
      code: { repository: 'web', path: 'src/components/Card.tsx', exportName: 'Card', framework: 'React', language: 'TypeScript', examples: [] },
      tags: ['card'],
      notes: ['content card'],
      owners: ['design-systems'],
      updatedAt: '2026-04-17T00:00:00Z'
    }], null, 2));

    const registry = new CodeConnectRegistry({ mappingsDir });
    const loaded = registry.refresh();
    assert.equal(loaded.length, 2);
    assert.equal(registry.findByFigmaComponentKey('cmp_btn')?.id, 'button-primary');
    assert.equal(registry.findByCodeComponent('src/components/Button.tsx', 'Button').length, 1);
    assert.equal(registry.search({ query: 'primary action', tag: 'button', framework: 'react', repository: 'web' }).length, 1);

    const summary = registry.getSummary();
    assert.equal(summary.fileCount, 2);
    assert.equal(summary.mappingCount, 2);
    assert.deepEqual(summary.frameworks, ['React']);
    assert.deepEqual(summary.repositories, ['web']);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
