import { Router } from 'express';

import { extractFigmaUiSchema } from '../../core/figma-ui-extractor';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';
import { executePluginCommandSchema } from '../../core/figma-write-service';
import { AppError } from '../../core/errors';
import { assertMvpWriteCommandAllowed } from '../../core/mvp-guardrails';

export const figmaUiRouter = Router();

figmaUiRouter.post(
  '/figma-ui/extract',
  validateRequest({ body: extractFigmaUiSchema }),
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.figmaUiExtractorService.extract(req.body);
    sendSuccess(res, data);
  })
);

figmaUiRouter.post(
  '/figma-ui/export-snapshot',
  validateRequest({ body: executePluginCommandSchema }),
  asyncHandler(async (req, res) => {
    if (req.body.command.type !== 'export_ui_snapshot') {
      throw new AppError('figma-ui/export-snapshot requires command.type=export_ui_snapshot', 400, 'VALIDATION_ERROR');
    }
    assertMvpWriteCommandAllowed(req.body.command);
    const runtime = req.app.locals.writeRuntime;
    if (!runtime.enabled) {
      throw new AppError('Write actions are disabled', 403, 'WRITE_ACTIONS_DISABLED');
    }
    if (!runtime.allowedOperations.includes('execute-plugin-command')) {
      throw new AppError('Write operation is not allowed: execute-plugin-command', 403, 'WRITE_OPERATION_NOT_ALLOWED');
    }
    const resolvedSession = req.app.locals.pluginBridgeService.resolveSession({
      sessionId: req.body.sessionId,
      fileKey: req.body.fileKey,
      clientName: req.body.clientName
    });
    const command = req.app.locals.pluginBridgeService.queueExecutePluginCommand({
      sessionId: resolvedSession.sessionId,
      fileKey: req.body.fileKey ?? resolvedSession.fileKey,
      command: req.body.command,
      actorId: req.header('x-actor-id')?.trim() || 'bearer-client'
    });
    sendSuccess(res, {
      operation: 'export-ui-snapshot',
      performed: false,
      dryRun: false,
      payload: {
        fileKey: req.body.fileKey ?? resolvedSession.fileKey ?? null,
        clientName: req.body.clientName ?? resolvedSession.clientName ?? null,
        sessionId: resolvedSession.sessionId,
        command: req.body.command
      },
      result: {
        commandId: command.commandId,
        status: command.status
      },
      notes: [
        'export_ui_snapshot was queued for a connected plugin bridge session.',
        'The plugin will return an enriched Unified UI Model snapshot, including plugin uiId bindings when available.'
      ]
    }, 202);
  })
);
