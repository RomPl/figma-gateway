import type { Server } from 'node:http';

import { logger } from '../utils/logger';

const SHUTDOWN_TIMEOUT_MS = 10_000;

export const registerGracefulShutdown = (server: Server): void => {
  let isShuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.warn({ signal }, 'Shutdown signal received');

    const forceExitTimer = setTimeout(() => {
      logger.error('Forced process exit after shutdown timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    forceExitTimer.unref();

    server.close((error) => {
      clearTimeout(forceExitTimer);

      if (error) {
        logger.error({ err: error }, 'Server shutdown failed');
        process.exit(1);
      }

      logger.info('Server stopped gracefully');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};
