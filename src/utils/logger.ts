import pino from 'pino';

import { config } from '../config/env';

export const loggerOptions: pino.LoggerOptions = {
  name: config.appName,
  level: config.logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'request.headers.authorization',
      'headers.authorization',
      'authorization',
      'token',
      'apiBearerToken',
      'figmaToken'
    ],
    censor: '[REDACTED]'
  },
  base: {
    service: config.appName,
    env: config.nodeEnv,
    version: config.appVersion
  },
  timestamp: pino.stdTimeFunctions.isoTime
};

export const createLogger = (destination?: pino.DestinationStream) => pino(loggerOptions, destination);

export const logger = createLogger();
