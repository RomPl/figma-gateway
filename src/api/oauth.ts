import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { Router, type RequestHandler } from 'express';

const PUBLIC_BASE_URL = 'https://figma-gateway.vazovski.art';
const UPSTREAM_AUTH_SERVER = 'https://beget-mcp.vazovski.art';
type OAuthClient = { redirectUris: string[]; authMethod: string; secret?: string };

const oauthClientsFile = process.env.OAUTH_CLIENTS_FILE ?? '/mnt/newdisk/state/figma-gateway/oauth-clients.json';

export const loadOAuthClients = (): Map<string, OAuthClient> => {
  if (!existsSync(oauthClientsFile)) return new Map();
  try {
    const raw = JSON.parse(readFileSync(oauthClientsFile, 'utf8')) as Record<string, OAuthClient>;
    return new Map(Object.entries(raw ?? {}).filter(([, value]) =>
      value && Array.isArray(value.redirectUris) && typeof value.authMethod === 'string'
    ));
  } catch {
    return new Map();
  }
};

const persistClients = (clients: Map<string, OAuthClient>): void => {
  mkdirSync(dirname(oauthClientsFile), { recursive: true });
  const tmp = oauthClientsFile + '.tmp';
  writeFileSync(tmp, JSON.stringify(Object.fromEntries(clients), null, 2), { encoding: 'utf8', mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, oauthClientsFile);
  chmodSync(oauthClientsFile, 0o600);
};

const clients = loadOAuthClients();
const codes = new Map<string, { clientId: string; redirectUri: string; challenge: string; createdAt: number }>();
const flows = new Map<string, {
  clientId: string; redirectUri: string; state: string; challenge: string;
  upstreamClientId: string; upstreamVerifier: string; createdAt: number;
}>();

const b64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');
const safeRedirectUri = (value: string): boolean => {
  try {
    const url = new URL(value);
    const loopback = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    const chatgpt = url.protocol === 'https:' && ['chatgpt.com', 'chat.openai.com'].includes(url.hostname);
    return loopback || chatgpt;
  } catch {
    return false;
  }
};

const signToken = (secret: string, kind: 'access' | 'refresh'): string => {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: PUBLIC_BASE_URL, aud: PUBLIC_BASE_URL, scope: 'mcp', kind,
    iat: now, exp: now + (kind === 'access' ? 86400 : 2592000),
  }));
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
};

const verifyToken = (token: string, secret: string, kind: 'access' | 'refresh'): boolean => {
  try {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) return false;
    const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    return claims.iss === PUBLIC_BASE_URL && claims.aud === PUBLIC_BASE_URL && claims.kind === kind
      && typeof claims.exp === 'number' && claims.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
};

export const verifyOAuthAccessToken = (token: string, secret: string): boolean => verifyToken(token, secret, 'access');

const asyncHandler = (handler: Parameters<typeof Router>[0] extends never ? never : (req: any, res: any) => Promise<void>): RequestHandler =>
  (req, res, next) => { handler(req, res).catch(next); };

export const createOAuthRouter = (signingSecret: string): Router => {
  const router = Router();

  router.post('/register', (req, res) => {
    const redirectUris = req.body?.redirect_uris;
    if (!Array.isArray(redirectUris) || redirectUris.length === 0 || !redirectUris.every((uri) => typeof uri === 'string' && safeRedirectUri(uri))) {
      res.status(400).json({ error: 'invalid_redirect_uri' });
      return;
    }
    const requestedMethod = req.body?.token_endpoint_auth_method;
    const authMethod = requestedMethod === 'none' ? 'none' : 'client_secret_post';
    const clientId = randomBytes(24).toString('base64url');
    const secret = authMethod === 'none' ? undefined : randomBytes(36).toString('base64url');
    clients.set(clientId, { redirectUris, authMethod, secret });
    persistClients(clients);
    res.json({
      client_id: clientId, redirect_uris: redirectUris,
      token_endpoint_auth_method: authMethod,
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
      ...(secret ? { client_secret: secret } : {}),
    });
  });

  router.get('/authorize', asyncHandler(async (req, res) => {
    const clientId = String(req.query.client_id ?? '');
    const redirectUri = String(req.query.redirect_uri ?? '');
    const challenge = String(req.query.code_challenge ?? '');
    const client = clients.get(clientId);
    if (req.query.response_type !== 'code' || req.query.code_challenge_method !== 'S256' || !challenge || !client?.redirectUris.includes(redirectUri)) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const upstreamRedirect = `${PUBLIC_BASE_URL}/oauth/upstream/callback`;
    const registered = await fetch(`${UPSTREAM_AUTH_SERVER}/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Figma Gateway MCP', redirect_uris: [upstreamRedirect], token_endpoint_auth_method: 'none' }),
    });
    if (!registered.ok) throw new Error('Upstream OAuth registration failed');
    const upstream = await registered.json() as { client_id?: string };
    if (!upstream.client_id) throw new Error('Upstream OAuth client missing');
    const upstreamState = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const upstreamChallenge = createHash('sha256').update(verifier).digest('base64url');
    flows.set(upstreamState, {
      clientId, redirectUri, state: String(req.query.state ?? ''), challenge,
      upstreamClientId: upstream.client_id, upstreamVerifier: verifier, createdAt: Date.now(),
    });
    const params = new URLSearchParams({
      response_type: 'code', client_id: upstream.client_id, redirect_uri: upstreamRedirect,
      scope: 'mcp', state: upstreamState, code_challenge: upstreamChallenge, code_challenge_method: 'S256',
    });
    res.redirect(`${UPSTREAM_AUTH_SERVER}/authorize?${params}`);
  }));

  router.get('/oauth/upstream/callback', asyncHandler(async (req, res) => {
    const state = String(req.query.state ?? '');
    const code = String(req.query.code ?? '');
    const flow = flows.get(state);
    flows.delete(state);
    if (!flow || !code || Date.now() - flow.createdAt > 600_000) {
      res.status(400).json({ error: 'invalid_state' });
      return;
    }
    const upstreamRedirect = `${PUBLIC_BASE_URL}/oauth/upstream/callback`;
    const body = new URLSearchParams({
      grant_type: 'authorization_code', code, code_verifier: flow.upstreamVerifier,
      client_id: flow.upstreamClientId, redirect_uri: upstreamRedirect,
    });
    const exchanged = await fetch(`${UPSTREAM_AUTH_SERVER}/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
    });
    const upstream = await exchanged.json() as { access_token?: string };
    if (!exchanged.ok || !upstream.access_token) {
      res.status(401).json({ error: 'upstream_authentication_failed' });
      return;
    }
    const downstreamCode = randomBytes(32).toString('base64url');
    codes.set(downstreamCode, { clientId: flow.clientId, redirectUri: flow.redirectUri, challenge: flow.challenge, createdAt: Date.now() });
    const target = new URL(flow.redirectUri);
    target.searchParams.set('code', downstreamCode);
    if (flow.state) target.searchParams.set('state', flow.state);
    res.redirect(target.toString());
  }));

  router.post('/token', (req, res) => {
    if (req.body?.grant_type === 'refresh_token') {
      if (!verifyToken(String(req.body.refresh_token ?? ''), signingSecret, 'refresh')) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
      res.json({ access_token: signToken(signingSecret, 'access'), token_type: 'Bearer', expires_in: 86400, scope: 'mcp' });
      return;
    }
    if (req.body?.grant_type !== 'authorization_code') {
      res.status(400).json({ error: 'unsupported_grant_type' });
      return;
    }
    const clientId = String(req.body.client_id ?? '');
    const client = clients.get(clientId);
    const code = codes.get(String(req.body.code ?? ''));
    codes.delete(String(req.body.code ?? ''));
    if (!client || !code || code.clientId !== clientId || code.redirectUri !== req.body.redirect_uri || Date.now() - code.createdAt > 300_000) {
      res.status(400).json({ error: 'invalid_grant' });
      return;
    }
    if (client.authMethod !== 'none' && client.secret !== req.body.client_secret) {
      res.status(401).json({ error: 'invalid_client' });
      return;
    }
    const computed = createHash('sha256').update(String(req.body.code_verifier ?? '')).digest('base64url');
    const computedBuffer = Buffer.from(computed);
    const challengeBuffer = Buffer.from(code.challenge);
    if (computedBuffer.length !== challengeBuffer.length || !timingSafeEqual(computedBuffer, challengeBuffer)) {
      res.status(400).json({ error: 'invalid_grant' });
      return;
    }
    res.json({ access_token: signToken(signingSecret, 'access'), refresh_token: signToken(signingSecret, 'refresh'), token_type: 'Bearer', expires_in: 86400, scope: 'mcp' });
  });

  return router;
};
