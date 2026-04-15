import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, type ZodType } from 'zod';

import { AppError } from '../../core/errors';

type RequestSchemas = {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
};

export const sendSuccess = <T>(res: Response, data: T, statusCode = 200): void => {
  res.status(statusCode).json({
    success: true,
    data
  });
};

export const asyncHandler =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

export const validateRequest =
  (schemas: RequestSchemas): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = z
      .object({
        body: schemas.body ?? z.any(),
        params: schemas.params ?? z.any(),
        query: schemas.query ?? z.any()
      })
      .safeParse({
        body: req.body,
        params: req.params,
        query: req.query
      });

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`)
        .join('; ');

      next(new AppError(message, 400, 'VALIDATION_ERROR', result.error.flatten()));
      return;
    }

    req.body = result.data.body;
    req.params = result.data.params as Request['params'];
    req.query = result.data.query as Request['query'];

    next();
  };
