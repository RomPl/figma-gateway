import { Router } from 'express';
import { z } from 'zod';

import { AppError } from '../../core/errors';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

const registerSessionSchema = z.object({
  fileKey: z.string().trim().min(1).optional(),
  localFileKey: z.string().trim().min(1).optional(),
  fileName: z.string().trim().min(1).max(500).optional(),
  clientName: z.string().trim().min(1).max(200).optional()
});

const completeCommandSchema = z.object({
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.string().trim().min(1),
      message: z.string().trim().min(1)
    })
    .optional()
});

const getPluginActor = (req: Parameters<typeof asyncHandler>[0] extends (req: infer R, ...args: infer _A) => unknown ? R : never) => ({
  type: 'api-client' as const,
  id: req.header('x-actor-id')?.trim() || 'plugin-bridge-client',
  ip: req.ip,
  userAgent: req.header('user-agent') ?? undefined
});


const getSingleValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : undefined;
  }
  return undefined;
};

export const pluginBridgeRouter = Router();

pluginBridgeRouter.post(
  '/plugin-bridge/sessions/register',
  validateRequest({ body: registerSessionSchema }),
  asyncHandler(async (req, res) => {
    const session = req.app.locals.pluginBridgeService.registerSession({
      fileKey: req.body.fileKey,
      localFileKey: req.body.localFileKey,
      fileName: req.body.fileName,
      clientName: req.body.clientName
    });
    req.app.locals.auditService.record({
      source: 'rest',
      requestId: req.id,
      actor: getPluginActor(req as never),
      target: 'plugin-bridge.register-session',
      params: { fileKey: req.body.fileKey, localFileKey: req.body.localFileKey, fileName: req.body.fileName, clientName: req.body.clientName, sessionId: session.sessionId },
      status: 'success'
    });
    sendSuccess(res, {
      sessionId: session.sessionId,
      sessionToken: session.sessionToken,
      fileKey: session.fileKey,
      clientName: session.clientName,
      createdAt: session.createdAt,
      endpoints: {
        pendingCommands: `/api/plugin-bridge/sessions/${session.sessionId}/commands/pending`,
        completeCommand: `/api/plugin-bridge/sessions/${session.sessionId}/commands/{commandId}/complete`
      }
    });
  })
);

pluginBridgeRouter.get(
  '/plugin-bridge/sessions',
  asyncHandler(async (req, res) => {
    sendSuccess(res, req.app.locals.pluginBridgeService.listSessions());
  })
);

pluginBridgeRouter.get(
  '/plugin-bridge/sessions/active',
  asyncHandler(async (req, res) => {
    sendSuccess(res, req.app.locals.pluginBridgeService.listActiveSessions());
  })
);

pluginBridgeRouter.get(
  '/plugin-bridge/sessions/:sessionId/commands/pending',
  asyncHandler(async (req, res) => {
    const token = req.header('x-plugin-session-token') ?? getSingleValue(req.query.sessionToken);
    const sessionId = String(req.params.sessionId);
    const data = req.app.locals.pluginBridgeService.getPendingCommands(sessionId, token);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    sendSuccess(res, data);
  })
);



pluginBridgeRouter.get(
  '/plugin-bridge/sessions/:sessionId/commands/:commandId',
  asyncHandler(async (req, res) => {
    const token = req.header('x-plugin-session-token') ?? getSingleValue(req.query.sessionToken);
    const sessionId = String(req.params.sessionId);
    const commandId = String(req.params.commandId);
    const data = req.app.locals.pluginBridgeService.getCommand(sessionId, commandId, token);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    sendSuccess(res, data);
  })
);

pluginBridgeRouter.post(
  '/plugin-bridge/sessions/:sessionId/commands/:commandId/complete',
  validateRequest({ body: completeCommandSchema }),
  asyncHandler(async (req, res) => {
    const token = req.header('x-plugin-session-token') ?? getSingleValue(req.query.sessionToken);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const command = req.app.locals.pluginBridgeService.completeCommand(
      {
        sessionId: String(req.params.sessionId),
        commandId: String(req.params.commandId),
        result: req.body.result,
        error: req.body.error
      },
      token
    );
    sendSuccess(res, command);
  })
);
