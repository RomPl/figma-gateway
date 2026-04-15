import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const normalizeRequestId = (value: string | undefined): string => {
  if (!value) {
    return randomUUID();
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) {
    return randomUUID();
  }

  return trimmed;
};

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const requestId = normalizeRequestId(req.header('x-request-id'));

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
};
