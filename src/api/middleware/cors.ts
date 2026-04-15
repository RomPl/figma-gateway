import type { RequestHandler } from 'express';

import { AppError } from '../../core/errors';

const DEFAULT_ALLOWED_HEADERS = 'Authorization, Content-Type, X-Request-Id, X-Plugin-Session-Token';
const DEFAULT_ALLOWED_METHODS = 'GET, POST, OPTIONS';

const normalizeOrigin = (value: string): string => value.trim().replace(/\/+$/, '').toLowerCase();

const splitOriginHeader = (originHeader: string): string[] =>
  originHeader
    .split(',')
    .map((part) => normalizeOrigin(part))
    .filter(Boolean);

const extractComparableOrigins = (origin: string): string[] => {
  const normalized = normalizeOrigin(origin);
  const variants = new Set<string>([normalized]);

  if (normalized === 'null') {
    return Array.from(variants);
  }

  try {
    const url = new URL(normalized);
    variants.add(`${url.protocol}//${url.hostname}`.toLowerCase());
    variants.add(url.hostname.toLowerCase());
  } catch {
    // ignore URL parse failures and fall back to the raw normalized value
  }

  return Array.from(variants);
};

export const createCorsMiddleware = (allowedOrigins: string[]): RequestHandler => {
  const allowAll = allowedOrigins.includes('*');
  const allowed = new Set(
    allowedOrigins.flatMap((origin) => extractComparableOrigins(origin))
  );

  return (req, res, next) => {
    const originHeader = req.header('origin');

    if (!originHeader) {
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }

      next();
      return;
    }

    const requestedOrigins = splitOriginHeader(originHeader).flatMap((origin) => extractComparableOrigins(origin));
    const canonicalOrigin = splitOriginHeader(originHeader)[0] ?? originHeader;
    const isAllowed = allowAll || requestedOrigins.some((value) => allowed.has(value));

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', canonicalOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', DEFAULT_ALLOWED_HEADERS);
      res.setHeader('Access-Control-Allow-Methods', DEFAULT_ALLOWED_METHODS);

      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }

      next();
      return;
    }

    next(new AppError('Origin is not allowed', 403, 'CORS_FORBIDDEN'));
  };
};
