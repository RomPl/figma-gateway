import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { AliasRegistry } from '../../src/core/alias-registry';
import { AppError } from '../../src/core/errors';
import { createFigmaWriteService } from '../../src/core/figma-write-service';
import type { FigmaWriteAdapter } from '../../src/core/figma-write-types';
import { createSqliteDatabase } from '../../src/db/sqlite';
import { migrateDatabase } from '../../src/db/migrate';

const actor = {
  type: 'api-client' as const,
  id: 'test-actor'
};

const createRegistry = () => {
  const dir = mkdtempSync(join(tmpdir(), 'figma-write-service-'));
  const dbPath = join(dir, 'write.sqlite');
  const db = createSqliteDatabase(dbPath);
  migrateDatabase(db);
  const registry = new AliasRegistry(db);

  return {
    dir,
    registry,
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  };
};

const createAdapterSpy = () => {
  const calls: string[] = [];

  const adapter: FigmaWriteAdapter = {
    createFrame: async (request) => {
      calls.push(request.operation);
      return { id: 'frame-1' };
    },
    updateText: async (request) => {
      calls.push(request.operation);
      return { id: request.input.nodeId, text: request.input.text };
    },
    createSection: async (request) => {
      calls.push(request.operation);
      return { id: 'section-1', name: request.input.name };
    },
    duplicateBlock: async (request) => {
      calls.push(request.operation);
      return { id: 'duplicate-1', sourceNodeId: request.input.nodeId };
    },
    applyStyleFromAlias: async (request) => {
      calls.push(request.operation);
      return { id: request.input.nodeId, alias: request.input.sourceAlias.alias };
    }
  };

  return { adapter, calls };
};

test('write service blocks operations when write actions are disabled', async () => {
  const { registry, cleanup } = createRegistry();

  try {
    const service = createFigmaWriteService({
      aliasRegistry: registry,
      adapter: createAdapterSpy().adapter,
      enabled: false,
      allowedOperations: ['create-frame']
    });

    const dryRunResult = await service.createFrame(
          {
            operation: 'create-frame',
            input: {
              fileKey: 'file-1',
              parentNodeId: '1:1',
              name: 'Hero',
              width: 1440,
              height: 400
            }
          },
          {
            actor,
            dryRun: true
          }
        );

    assert.equal(dryRunResult.dryRun, true);
    assert.equal(dryRunResult.performed, false);
  } finally {
    cleanup();
  }
});

test('write service returns dry-run result without calling adapter', async () => {
  const { registry, cleanup } = createRegistry();
  const { adapter, calls } = createAdapterSpy();

  try {
    const service = createFigmaWriteService({
      aliasRegistry: registry,
      adapter,
      enabled: true,
      allowedOperations: ['update-text']
    });

    const result = await service.updateText(
      {
        operation: 'update-text',
        input: {
          fileKey: 'file-1',
          nodeId: '1:2',
          text: 'New CTA'
        }
      },
      {
        actor,
        dryRun: true
      }
    );

    assert.equal(result.performed, false);
    assert.equal(result.dryRun, true);
    assert.equal(calls.length, 0);
  } finally {
    cleanup();
  }
});

test('write service executes through live adapter when enabled and dryRun=false', async () => {
  const { registry, cleanup } = createRegistry();
  const { adapter, calls } = createAdapterSpy();

  try {
    const service = createFigmaWriteService({
      aliasRegistry: registry,
      adapter,
      enabled: true,
      allowedOperations: ['duplicate-block']
    });

    const result = await service.duplicateBlock(
      {
        operation: 'duplicate-block',
        input: {
          fileKey: 'file-1',
          nodeId: '1:5',
          targetParentNodeId: '1:7'
        }
      },
      {
        actor,
        dryRun: false
      }
    );

    assert.equal(result.performed, true);
    assert.equal(result.dryRun, false);
    assert.deepEqual(result.payload, {
      id: 'duplicate-1',
      sourceNodeId: '1:5'
    });
    assert.deepEqual(calls, ['duplicate-block']);
  } finally {
    cleanup();
  }
});

test('apply-style-from-alias resolves alias before live execution', async () => {
  const { registry, cleanup } = createRegistry();
  const { adapter } = createAdapterSpy();

  try {
    registry.upsert({
      alias: 'button-primary-style',
      fileKey: 'file-style',
      nodeId: '2:3',
      project: 'design-system',
      tags: ['style'],
      description: 'Primary button style source'
    });

    const service = createFigmaWriteService({
      aliasRegistry: registry,
      adapter,
      enabled: true,
      allowedOperations: ['apply-style-from-alias']
    });

    const result = await service.applyStyleFromAlias(
      {
        operation: 'apply-style-from-alias',
        input: {
          fileKey: 'file-app',
          nodeId: '9:1',
          alias: 'button-primary-style'
        }
      },
      {
        actor,
        dryRun: false
      }
    );

    assert.equal(result.performed, true);
    assert.deepEqual(result.payload, {
      id: '9:1',
      alias: 'button-primary-style'
    });
  } finally {
    cleanup();
  }
});
