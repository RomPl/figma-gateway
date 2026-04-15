import assert from 'node:assert/strict';
import test from 'node:test';

import { createLogger } from '../../src/utils/logger';

test('logger redacts authorization header and token fields', async () => {
  let output = '';
  const destination = {
    write(chunk: string) {
      output += chunk;
      return true;
    }
  };

  const logger = createLogger(destination);

  logger.info({
    req: {
      headers: {
        authorization: 'Bearer super-secret'
      }
    },
    token: 'plain-secret',
    figmaToken: 'figma-secret'
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(output.includes('super-secret'), false);
  assert.equal(output.includes('plain-secret'), false);
  assert.equal(output.includes('figma-secret'), false);
  assert.equal(output.includes('[REDACTED]'), true);
});
