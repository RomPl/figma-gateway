import type { RequestHandler } from 'express';

import { AppError } from '../../core/errors';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export const createRateLimitMiddleware = (
  windowMs: number,
  maxRequests: number
): RequestHandler => {
  const store = new Map<string, RateLimitEntry>();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const current = store.get(key);

    if (!current || current.resetAt <= now) {
      store.set(key, {
        count: 1,
        resetAt: now + windowMs
      });

      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(maxRequests - 1));
      return next();
    }

    current.count += 1;
    store.set(key, current);

    const remaining = Math.max(0, maxRequests - current.count);
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (current.count > maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      next(
        new AppError('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED', {
          retryAfterSeconds
        })
      );
      return;
    }

    next();
  };
};
