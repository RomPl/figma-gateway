import type { RequestHandler } from 'express';

import { AppError } from '../../core/errors';

const parseBearerToken = (authorizationHeader?: string): string | null => {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
};

export const createAuthMiddleware = (expectedToken?: string): RequestHandler => {
  if (!expectedToken) {
    throw new AppError('API_BEARER_TOKEN is not configured', 500, 'AUTH_MISCONFIGURED');
  }

  return (req, _res, next) => {
    const token = parseBearerToken(req.headers.authorization);

    if (!token) {
      next(new AppError('Missing bearer token', 401, 'UNAUTHORIZED'));
      return;
    }

    if (token !== expectedToken) {
      next(new AppError('Invalid bearer token', 403, 'FORBIDDEN'));
      return;
    }

    next();
  };
};
