import type { NextFunction, Request, Response } from 'express';

import { AppError } from './errors';
import { logger } from '../utils/logger';

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'ROUTE_NOT_FOUND'));
};

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const appError =
    error instanceof AppError
      ? error
      : new AppError('Internal server error', 500, 'INTERNAL_ERROR');

  logger.error(
    {
      err: error,
      method: req.method,
      path: req.originalUrl,
      statusCode: appError.statusCode
    },
    appError.message
  );

  res.locals.auditErrorCode = appError.code;
  res.locals.auditErrorMessage = appError.message;
  res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message
    }
  });
};
