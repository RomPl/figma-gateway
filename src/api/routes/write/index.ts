import type { Request } from 'express';
import { Router } from 'express';

import {
  applyStyleFromAliasSchema,
  createFileSchema,
  createFrameSchema,
  createPageSchema,
  createSectionSchema,
  duplicateBlockSchema,
  executePluginBatchSchema,
  executePluginCommandSchema,
  updateTextSchema
} from '../../../core/figma-write-service';
import type { AuditActor } from '../../../core/audit';
import { AppError } from '../../../core/errors';
import { asyncHandler, sendSuccess, validateRequest } from '../helpers';
import type { FigmaWriteOperation } from '../../../core/figma-write-types';
import { assertMvpWriteBatchAllowed, assertMvpWriteCommandAllowed } from '../../../core/mvp-guardrails';

const getRestWriteActor = (req: Request): AuditActor => ({
  type: 'api-client',
  id: req.header('x-actor-id')?.trim() || 'bearer-client',
  ip: req.ip,
  userAgent: req.header('user-agent') ?? undefined
});

const assertQueuedWriteAllowed = (req: Request, operation: FigmaWriteOperation): void => {
  const runtime = req.app.locals.writeRuntime;
  if (!runtime.enabled) {
    throw new AppError('Write actions are disabled', 403, 'WRITE_ACTIONS_DISABLED');
  }
  if (!runtime.allowedOperations.includes(operation)) {
    throw new AppError(`Write operation is not allowed: ${operation}`, 403, 'WRITE_OPERATION_NOT_ALLOWED');
  }
};

const resolveQueuedSession = (req: Request) =>
  req.app.locals.pluginBridgeService.resolveSession({
    sessionId: req.body.sessionId,
    fileKey: req.body.fileKey,
    clientName: req.body.clientName
  });

export const writeRouter = Router();

writeRouter.post(
  '/create-frame',
  validateRequest({ body: createFrameSchema }),
  asyncHandler(async (req, res) => {
    const actor = getRestWriteActor(req);
    if (req.body.dryRun) {
      sendSuccess(res, {
        operation: 'create-frame',
        performed: false,
        dryRun: true,
        payload: {
          fileKey: req.body.fileKey ?? null,
          clientName: req.body.clientName ?? null,
          sessionId: req.body.sessionId ?? null,
          parentNodeId: req.body.parentNodeId ?? null,
          uiId: req.body.uiId ?? null,
          name: req.body.name,
          width: req.body.width,
          height: req.body.height,
          x: req.body.x ?? null,
          y: req.body.y ?? null
        },
        notes: [
          'Dry run enabled. No plugin bridge command was queued.',
          'For live frame creation, dryRun must be false. When sessionId is omitted, the server will try to use the latest active plugin session automatically.'
        ]
      });
      return;
    }
    assertQueuedWriteAllowed(req, 'create-frame');
    const resolvedSession = resolveQueuedSession(req);
    const command = req.app.locals.pluginBridgeService.queueCreateFrame({
      sessionId: resolvedSession.sessionId,
      fileKey: req.body.fileKey ?? resolvedSession.fileKey,
      parentNodeId: req.body.parentNodeId,
      uiId: req.body.uiId,
      name: req.body.name,
      width: req.body.width,
      height: req.body.height,
      x: req.body.x,
      y: req.body.y,
      actorId: actor.id
    });
    sendSuccess(res, {
      operation: 'create-frame',
      performed: false,
      dryRun: false,
      payload: {
        fileKey: req.body.fileKey ?? resolvedSession.fileKey ?? null,
        clientName: req.body.clientName ?? resolvedSession.clientName ?? null,
        sessionId: resolvedSession.sessionId,
        parentNodeId: req.body.parentNodeId ?? null,
        uiId: req.body.uiId ?? null,
        name: req.body.name,
        width: req.body.width,
        height: req.body.height,
        x: req.body.x ?? null,
        y: req.body.y ?? null
      },
      result: {
        commandId: command.commandId,
        status: command.status
      },
      notes: [
        'Create-frame was queued for a connected plugin bridge session.',
        'A plugin running inside Figma must poll and execute the command.',
        req.body.sessionId ? 'Explicit sessionId was used.' : 'SessionId was auto-resolved from the latest active plugin session.'
      ]
    }, 202);
  })
);

writeRouter.post(
  '/update-text',
  validateRequest({ body: updateTextSchema }),
  asyncHandler(async (req, res) => {
    const actor = getRestWriteActor(req);
    if (req.body.dryRun) {
      sendSuccess(res, {
        operation: 'update-text',
        performed: false,
        dryRun: true,
        payload: {
          fileKey: req.body.fileKey ?? null,
          clientName: req.body.clientName ?? null,
          sessionId: req.body.sessionId ?? null,
          nodeId: req.body.nodeId,
          text: req.body.text
        },
        notes: [
          'Dry run enabled. No plugin bridge command was queued.',
          'For live text updates, dryRun must be false. When sessionId is omitted, the server will try to use the latest active plugin session automatically.'
        ]
      });
      return;
    }
    assertQueuedWriteAllowed(req, 'update-text');
    const resolvedSession = resolveQueuedSession(req);
    const command = req.app.locals.pluginBridgeService.queueUpdateText({
      sessionId: resolvedSession.sessionId,
      fileKey: req.body.fileKey ?? resolvedSession.fileKey,
      nodeId: req.body.nodeId,
      text: req.body.text,
      actorId: actor.id
    });
    sendSuccess(res, {
      operation: 'update-text',
      performed: false,
      dryRun: false,
      payload: {
        fileKey: req.body.fileKey ?? resolvedSession.fileKey ?? null,
        clientName: req.body.clientName ?? resolvedSession.clientName ?? null,
        sessionId: resolvedSession.sessionId,
        nodeId: req.body.nodeId,
        text: req.body.text
      },
      result: {
        commandId: command.commandId,
        status: command.status
      },
      notes: [
        'Update-text was queued for a connected plugin bridge session.',
        'A plugin running inside Figma must poll and execute the command.',
        req.body.sessionId ? 'Explicit sessionId was used.' : 'SessionId was auto-resolved from the latest active plugin session.'
      ]
    }, 202);
  })
);

writeRouter.post(
  '/create-section',
  validateRequest({ body: createSectionSchema }),
  asyncHandler(async (req, res) => {
    const actor = getRestWriteActor(req);
    if (req.body.dryRun) {
      sendSuccess(res, {
        operation: 'create-section',
        performed: false,
        dryRun: true,
        payload: {
          fileKey: req.body.fileKey ?? null,
          clientName: req.body.clientName ?? null,
          sessionId: req.body.sessionId ?? null,
          parentNodeId: req.body.parentNodeId ?? null,
          uiId: req.body.uiId ?? null,
          name: req.body.name,
          width: req.body.width ?? null,
          height: req.body.height ?? null,
          x: req.body.x ?? null,
          y: req.body.y ?? null
        },
        notes: [
          'Dry run enabled. No plugin bridge command was queued.',
          'For live section creation, dryRun must be false. When sessionId is omitted, the server will try to use the latest active plugin session automatically.'
        ]
      });
      return;
    }
    assertQueuedWriteAllowed(req, 'create-section');
    const resolvedSession = resolveQueuedSession(req);
    const command = req.app.locals.pluginBridgeService.queueCreateSection({
      sessionId: resolvedSession.sessionId,
      fileKey: req.body.fileKey ?? resolvedSession.fileKey,
      parentNodeId: req.body.parentNodeId,
      uiId: req.body.uiId,
      name: req.body.name,
      width: req.body.width,
      height: req.body.height,
      x: req.body.x,
      y: req.body.y,
      actorId: actor.id
    });
    sendSuccess(res, {
      operation: 'create-section',
      performed: false,
      dryRun: false,
      payload: {
        fileKey: req.body.fileKey ?? resolvedSession.fileKey ?? null,
        clientName: req.body.clientName ?? resolvedSession.clientName ?? null,
        sessionId: resolvedSession.sessionId,
        parentNodeId: req.body.parentNodeId ?? null,
        uiId: req.body.uiId ?? null,
        name: req.body.name,
        width: req.body.width ?? null,
        height: req.body.height ?? null,
        x: req.body.x ?? null,
        y: req.body.y ?? null
      },
      result: {
        commandId: command.commandId,
        status: command.status
      },
      notes: [
        'Create-section was queued for a connected plugin bridge session.',
        'A plugin running inside Figma must poll and execute the command.',
        req.body.sessionId ? 'Explicit sessionId was used.' : 'SessionId was auto-resolved from the latest active plugin session.'
      ]
    }, 202);
  })
);

writeRouter.post(
  '/duplicate-block',
  validateRequest({ body: duplicateBlockSchema }),
  asyncHandler(async (req, res) => {
    const actor = getRestWriteActor(req);
    if (req.body.dryRun) {
      sendSuccess(res, {
        operation: 'duplicate-block',
        performed: false,
        dryRun: true,
        payload: {
          fileKey: req.body.fileKey ?? null,
          clientName: req.body.clientName ?? null,
          sessionId: req.body.sessionId ?? null,
          nodeId: req.body.nodeId,
          targetParentNodeId: req.body.targetParentNodeId ?? null,
          name: req.body.name ?? null,
          x: req.body.x ?? null,
          y: req.body.y ?? null
        },
        notes: [
          'Dry run enabled. No plugin bridge command was queued.',
          'For live block duplication, dryRun must be false. When sessionId is omitted, the server will try to use the latest active plugin session automatically.'
        ]
      });
      return;
    }
    assertQueuedWriteAllowed(req, 'duplicate-block');
    const resolvedSession = resolveQueuedSession(req);
    const command = req.app.locals.pluginBridgeService.queueDuplicateBlock({
      sessionId: resolvedSession.sessionId,
      fileKey: req.body.fileKey ?? resolvedSession.fileKey,
      nodeId: req.body.nodeId,
      targetParentNodeId: req.body.targetParentNodeId,
      name: req.body.name,
      x: req.body.x,
      y: req.body.y,
      actorId: actor.id
    });
    sendSuccess(res, {
      operation: 'duplicate-block',
      performed: false,
      dryRun: false,
      payload: {
        fileKey: req.body.fileKey ?? resolvedSession.fileKey ?? null,
        clientName: req.body.clientName ?? resolvedSession.clientName ?? null,
        sessionId: resolvedSession.sessionId,
        nodeId: req.body.nodeId,
        targetParentNodeId: req.body.targetParentNodeId ?? null,
        name: req.body.name ?? null,
        x: req.body.x ?? null,
        y: req.body.y ?? null
      },
      result: {
        commandId: command.commandId,
        status: command.status
      },
      notes: [
        'Duplicate-block was queued for a connected plugin bridge session.',
        'A plugin running inside Figma must poll and execute the command.',
        req.body.sessionId ? 'Explicit sessionId was used.' : 'SessionId was auto-resolved from the latest active plugin session.'
      ]
    }, 202);
  })
);

writeRouter.post(
  '/apply-style-from-alias',
  validateRequest({ body: applyStyleFromAliasSchema }),
  asyncHandler(async (req, res) => {
    const actor = getRestWriteActor(req);
    if (req.body.dryRun) {
      sendSuccess(res, {
        operation: 'apply-style-from-alias',
        performed: false,
        dryRun: true,
        payload: {
          fileKey: req.body.fileKey ?? null,
          clientName: req.body.clientName ?? null,
          sessionId: req.body.sessionId ?? null,
          alias: req.body.alias,
          nodeId: req.body.nodeId
        },
        notes: [
          'Dry run enabled. No plugin bridge command was queued.',
          'For live alias style application, dryRun must be false. When sessionId is omitted, the server will try to use the latest active plugin session automatically.'
        ]
      });
      return;
    }
    assertQueuedWriteAllowed(req, 'apply-style-from-alias');
    const resolvedSession = resolveQueuedSession(req);
    const command = req.app.locals.pluginBridgeService.queueApplyStyleFromAlias({
      sessionId: resolvedSession.sessionId,
      fileKey: req.body.fileKey ?? resolvedSession.fileKey,
      alias: req.body.alias,
      nodeId: req.body.nodeId,
      actorId: actor.id
    });
    sendSuccess(res, {
      operation: 'apply-style-from-alias',
      performed: false,
      dryRun: false,
      payload: {
        fileKey: req.body.fileKey ?? resolvedSession.fileKey ?? null,
        clientName: req.body.clientName ?? resolvedSession.clientName ?? null,
        sessionId: resolvedSession.sessionId,
        alias: req.body.alias,
        nodeId: req.body.nodeId
      },
      result: {
        commandId: command.commandId,
        status: command.status
      },
      notes: [
        'Apply-style-from-alias was queued for a connected plugin bridge session.',
        'A plugin running inside Figma must poll and execute the command.',
        req.body.sessionId ? 'Explicit sessionId was used.' : 'SessionId was auto-resolved from the latest active plugin session.'
      ]
    }, 202);
  })
);

writeRouter.post(
  '/create-page',
  validateRequest({ body: createPageSchema }),
  asyncHandler(async (req, res) => {
    const actor = getRestWriteActor(req);
    if (req.body.dryRun) {
      sendSuccess(res, {
        operation: 'create-page',
        performed: false,
        dryRun: true,
        payload: {
          fileKey: req.body.fileKey ?? null,
          name: req.body.name,
          sessionId: req.body.sessionId
        },
        notes: [
          'Dry run enabled. No plugin bridge command was queued.',
          'For live page creation, dryRun must be false. When sessionId is omitted, the server will try to use the latest active plugin session automatically.'
        ]
      });
      return;
    }
    assertQueuedWriteAllowed(req, 'execute-plugin-command');
    assertMvpWriteCommandAllowed(req.body.command);
    const resolvedSession = resolveQueuedSession(req);
    const command = req.app.locals.pluginBridgeService.queueCreatePage({
      sessionId: resolvedSession.sessionId,
      fileKey: req.body.fileKey ?? resolvedSession.fileKey,
      name: req.body.name,
      actorId: actor.id
    });
    sendSuccess(res, {
      operation: 'create-page',
      performed: false,
      dryRun: false,
      payload: {
        fileKey: req.body.fileKey ?? resolvedSession.fileKey ?? null,
        clientName: req.body.clientName ?? resolvedSession.clientName ?? null,
        name: req.body.name,
        sessionId: resolvedSession.sessionId
      },
      result: {
        commandId: command.commandId,
        status: command.status
      },
      notes: [
        'Create-page was queued for a connected plugin bridge session.',
        'A plugin running inside Figma must poll and execute the command.',
        req.body.sessionId ? 'Explicit sessionId was used.' : 'SessionId was auto-resolved from the latest active plugin session.'
      ]
    }, 202);
  })
);

writeRouter.post(
  '/execute-plugin-command',
  validateRequest({ body: executePluginCommandSchema }),
  asyncHandler(async (req, res) => {
    const actor = getRestWriteActor(req);
    if (req.body.dryRun) {
      sendSuccess(res, {
        operation: 'execute-plugin-command',
        performed: false,
        dryRun: true,
        payload: {
          fileKey: req.body.fileKey ?? null,
          clientName: req.body.clientName ?? null,
          sessionId: req.body.sessionId ?? null,
          command: req.body.command
        },
        notes: [
          'Dry run enabled. No plugin bridge command was queued.',
          'For live plugin command execution, dryRun must be false. When sessionId is omitted, the server will try to use the latest active plugin session automatically.'
        ]
      });
      return;
    }
    assertQueuedWriteAllowed(req, 'execute-plugin-command');
    assertMvpWriteCommandAllowed(req.body.command);
    const resolvedSession = resolveQueuedSession(req);
    const command = req.app.locals.pluginBridgeService.queueExecutePluginCommand({
      sessionId: resolvedSession.sessionId,
      fileKey: req.body.fileKey ?? resolvedSession.fileKey,
      command: req.body.command,
      actorId: actor.id
    });
    sendSuccess(res, {
      operation: 'execute-plugin-command',
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
        'Plugin command was queued for a connected plugin bridge session.',
        'A plugin running inside Figma must poll and execute the command.',
        req.body.sessionId ? 'Explicit sessionId was used.' : 'SessionId was auto-resolved from the latest active plugin session.'
      ]
    }, 202);
  })
);

writeRouter.post(
  '/execute-plugin-batch',
  validateRequest({ body: executePluginBatchSchema }),
  asyncHandler(async (req, res) => {
    const actor = getRestWriteActor(req);
    if (req.body.dryRun) {
      sendSuccess(res, {
        operation: 'execute-plugin-batch',
        performed: false,
        dryRun: true,
        payload: {
          fileKey: req.body.fileKey ?? null,
          clientName: req.body.clientName ?? null,
          sessionId: req.body.sessionId ?? null,
          commands: req.body.commands
        },
        notes: [
          'Dry run enabled. No plugin bridge command was queued.',
          'For live plugin batch execution, dryRun must be false. When sessionId is omitted, the server will try to use the latest active plugin session automatically.'
        ]
      });
      return;
    }
    assertQueuedWriteAllowed(req, 'execute-plugin-batch');
    assertMvpWriteBatchAllowed(req.body.commands);
    const resolvedSession = resolveQueuedSession(req);
    const command = req.app.locals.pluginBridgeService.queueExecutePluginBatch({
      sessionId: resolvedSession.sessionId,
      fileKey: req.body.fileKey ?? resolvedSession.fileKey,
      commands: req.body.commands,
      actorId: actor.id
    });
    sendSuccess(res, {
      operation: 'execute-plugin-batch',
      performed: false,
      dryRun: false,
      payload: {
        fileKey: req.body.fileKey ?? resolvedSession.fileKey ?? null,
        clientName: req.body.clientName ?? resolvedSession.clientName ?? null,
        sessionId: resolvedSession.sessionId,
        commands: req.body.commands
      },
      result: {
        commandId: command.commandId,
        status: command.status
      },
      notes: [
        'Plugin batch was queued for a connected plugin bridge session.',
        'A plugin running inside Figma must poll and execute the batch.',
        req.body.sessionId ? 'Explicit sessionId was used.' : 'SessionId was auto-resolved from the latest active plugin session.'
      ]
    }, 202);
  })
);

writeRouter.post(
  '/create-file',
  validateRequest({ body: createFileSchema }),
  asyncHandler(async (_req, _res) => {
    throw new AppError('Create file backend is not configured', 501, 'CREATE_FILE_BACKEND_NOT_CONFIGURED');
  })
);
