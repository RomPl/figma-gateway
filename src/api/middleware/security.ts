import type { RequestHandler } from 'express';

import type { Logger } from 'pino';

export const securityHeadersMiddleware: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  next();
};

export const createRequestLoggingMiddleware = (logger: Logger): RequestHandler => {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    const requestStartedAt = new Date().toISOString();

    res.on('finish', () => {
      const responseFinishedAt = new Date().toISOString();
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const responseBytes = typeof res.locals.responseBytes === 'number'
        ? res.locals.responseBytes
        : Number(res.getHeader('content-length') ?? 0) || undefined;
      const serializationMs = typeof res.locals.serializationMs === 'number'
        ? res.locals.serializationMs
        : undefined;

      logger.info(
        {
          requestId: req.id,
          correlationId: req.metricContext?.correlation_id,
          segmentId: req.metricContext?.segment_id,
          activityWindowId: req.metricContext?.activity_window_id,
          requestStartedAt,
          responseFinishedAt,
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs,
          serializationMs,
          responseBytes,
          contentType: res.getHeader('content-type')
        },
        'Request completed'
      );
    });

    next();
  };
};
