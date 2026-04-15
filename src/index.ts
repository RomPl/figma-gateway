import { createServer } from 'node:http';

import { createApp } from './api/app';
import { registerGracefulShutdown } from './core/shutdown';
import { config } from './config/env';
import { logger } from './utils/logger';

const bootstrap = () => {
  const app = createApp();
  const server = createServer(app);

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    process.exit(1);
  });

  server.listen(config.port, config.host, () => {
    logger.info(
      {
        host: config.host,
        port: config.port,
        environment: config.nodeEnv
      },
      'HTTP server started'
    );
  });

  server.on('error', (error) => {
    logger.fatal({ err: error }, 'HTTP server failed');
    process.exit(1);
  });

  registerGracefulShutdown(server);
};

bootstrap();
