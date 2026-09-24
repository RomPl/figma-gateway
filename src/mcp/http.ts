import type { NextFunction, Request as ExpressRequest, Response as ExpressResponse } from 'express';

import { createMcpServer, loadMcpServerModule } from './server';

type StreamableTransport = {
  handleRequest: (request: Request, options: { parsedBody: unknown }) => Promise<Response>;
};

export const createStreamableMcpHandler = () => {
  let ready: Promise<void> | undefined;
  let transport: StreamableTransport | undefined;

  const initialize = () => {
    if (!ready) {
      ready = (async () => {
        const { WebStandardStreamableHTTPServerTransport } = await loadMcpServerModule();
        const streamableTransport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true
        });
        await (await createMcpServer()).connect(streamableTransport);
        transport = streamableTransport;
      })();
    }
    return ready;
  };

  return async (req: ExpressRequest, res: ExpressResponse, next: NextFunction): Promise<void> => {
    try {
      const origin = req.get('origin');
      const host = req.get('host') ?? '';
      if (origin) {
        const parsed = new URL(origin);
        const allowed = parsed.host === host || origin === 'https://chatgpt.com' || origin === 'https://chat.openai.com';
        if (!allowed) {
          res.status(403).json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Invalid Origin' } });
          return;
        }
      }

      await initialize();
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
        else if (value !== undefined) headers.set(name, value);
      }
      const url = `${req.protocol}://${host}${req.originalUrl}`;
      const method = req.method.toUpperCase();
      const webRequest = new Request(url, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(req.body ?? {})
      });
      const response = await transport!.handleRequest(webRequest, { parsedBody: req.body });
      response.headers.forEach((value, name) => res.setHeader(name, value));
      res.status(response.status);
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length === 0) res.end();
      else res.send(body);
    } catch (error) {
      next(error);
    }
  };
};
