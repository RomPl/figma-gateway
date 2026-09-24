import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-oauth-'));
const state = path.join(dir, 'oauth-clients.json');
process.env.OAUTH_CLIENTS_FILE = state;

const { createOAuthRouter, loadOAuthClients } = await import('../dist/api/oauth.js');
const app = express();
app.use(express.json());
app.use(createOAuthRouter('ci-test-signing-secret'));

const server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});

try {
  const address = server.address();
  assert.equal(typeof address, 'object');
  const url = 'http://127.0.0.1:' + address.port + '/register';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      redirect_uris: ['https://chatgpt.com/connector/oauth/ci-test'],
      token_endpoint_auth_method: 'none'
    })
  });
  assert.equal(response.status, 200);
  const registration = await response.json();
  assert.ok(registration.client_id);

  const persisted = JSON.parse(fs.readFileSync(state, 'utf8'));
  assert.equal(
    persisted[registration.client_id].redirectUris[0],
    'https://chatgpt.com/connector/oauth/ci-test'
  );
  assert.equal(fs.statSync(state).mode & 0o777, 0o600);

  const reloaded = loadOAuthClients();
  assert.equal(reloaded.has(registration.client_id), true);
  console.log('figma_oauth_persistence_regression=pass');
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
}
