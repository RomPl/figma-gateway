import assert from 'node:assert/strict';
import test from 'node:test';

import { AppError } from '../../src/core/errors';
import { errorHandler, notFoundHandler } from '../../src/core/middleware';

test('notFoundHandler forwards standardized route-not-found error', () => {
  let captured: unknown = null;
  notFoundHandler({ method: 'GET', originalUrl: '/missing' } as any, {} as any, (error: unknown) => { captured = error; });
  assert.ok(captured instanceof AppError);
  assert.equal((captured as AppError).code, 'ROUTE_NOT_FOUND');
  assert.equal((captured as AppError).statusCode, 404);
});

test('errorHandler serializes AppError and annotates audit locals', () => {
  const res: any = {
    locals: {},
    statusCode: null,
    body: null,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; }
  };
  errorHandler(new AppError('Boom', 409, 'CONFLICTING_STATE'), { method: 'POST', originalUrl: '/api/test' } as any, res as any, (() => {}) as any);
  assert.equal(res.locals.auditErrorCode, 'CONFLICTING_STATE');
  assert.equal(res.locals.auditErrorMessage, 'Boom');
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { success: false, error: { code: 'CONFLICTING_STATE', message: 'Boom' } });
});

test('errorHandler normalizes unknown errors into INTERNAL_ERROR', () => {
  const res: any = {
    locals: {},
    statusCode: null,
    body: null,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; }
  };
  errorHandler(new Error('unexpected'), { method: 'GET', originalUrl: '/api/test' } as any, res as any, (() => {}) as any);
  assert.equal(res.locals.auditErrorCode, 'INTERNAL_ERROR');
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
});
