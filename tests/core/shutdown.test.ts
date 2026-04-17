import assert from 'node:assert/strict';
import test from 'node:test';

import { registerGracefulShutdown } from '../../src/core/shutdown';

test('registerGracefulShutdown closes server and exits 0 on successful signal handling', async () => {
  const listeners = new Map<string, (signal: NodeJS.Signals) => void>();
  const originalOn = process.on;
  const originalExit = process.exit;
  const originalSetTimeout = global.setTimeout;
  const closeCalls: string[] = [];
  const exitCodes: number[] = [];

  const fakeServer = {
    close(callback: (error?: Error | undefined) => void) {
      closeCalls.push('close');
      callback();
    }
  } as any;

  try {
    (process as any).on = ((event: string, handler: (signal: NodeJS.Signals) => void) => {
      listeners.set(event, handler);
      return process;
    }) as typeof process.on;
    (process as any).exit = ((code?: number) => {
      exitCodes.push(code ?? 0);
      return undefined as never;
    }) as typeof process.exit;
    (global as any).setTimeout = ((fn: () => void) => ({ unref() { return undefined; } })) as typeof setTimeout;

    registerGracefulShutdown(fakeServer);
    listeners.get('SIGTERM')?.('SIGTERM');
    listeners.get('SIGTERM')?.('SIGTERM');

    assert.deepEqual(closeCalls, ['close']);
    assert.deepEqual(exitCodes, [0]);
  } finally {
    (process as any).on = originalOn;
    (process as any).exit = originalExit;
    (global as any).setTimeout = originalSetTimeout;
  }
});

test('registerGracefulShutdown exits 1 when server close reports failure', async () => {
  const listeners = new Map<string, (signal: NodeJS.Signals) => void>();
  const originalOn = process.on;
  const originalExit = process.exit;
  const originalSetTimeout = global.setTimeout;
  const exitCodes: number[] = [];

  const fakeServer = {
    close(callback: (error?: Error | undefined) => void) {
      callback(new Error('close failed'));
    }
  } as any;

  try {
    (process as any).on = ((event: string, handler: (signal: NodeJS.Signals) => void) => {
      listeners.set(event, handler);
      return process;
    }) as typeof process.on;
    (process as any).exit = ((code?: number) => {
      exitCodes.push(code ?? 0);
      return undefined as never;
    }) as typeof process.exit;
    (global as any).setTimeout = ((fn: () => void) => ({ unref() { return undefined; } })) as typeof setTimeout;

    registerGracefulShutdown(fakeServer);
    listeners.get('SIGINT')?.('SIGINT');

    assert.deepEqual(exitCodes, [1]);
  } finally {
    (process as any).on = originalOn;
    (process as any).exit = originalExit;
    (global as any).setTimeout = originalSetTimeout;
  }
});
