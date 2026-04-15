import { AppError } from './errors';
import { config } from '../config/env';
import type {
  FigmaApiErrorPayload,
  FigmaComponentSetsResponse,
  FigmaComponentsResponse,
  FigmaFileNode,
  FigmaFileResponse,
  FigmaImageFormat,
  FigmaImagesResponse,
  FigmaNodesResponse,
  FigmaStylesResponse,
  FigmaVariablesResponse
} from '../types/figma';
import { logger as defaultLogger } from '../utils/logger';

type FetchLike = typeof fetch;

type SleepFn = (ms: number) => Promise<void>;

type LoggerLike = {
  debug: (bindings: Record<string, unknown>, message?: string) => void;
  warn: (bindings: Record<string, unknown>, message?: string) => void;
  error: (bindings: Record<string, unknown>, message?: string) => void;
};

export type FigmaClientOptions = {
  token?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: FetchLike;
  sleep?: SleepFn;
  logger?: LoggerLike;
};

export interface FigmaReadClient {
  getFile(fileKey: string): Promise<FigmaFileResponse>;
  getNode(fileKey: string, nodeId: string): Promise<FigmaFileNode | null>;
  getNodes(fileKey: string, nodeIds: string[]): Promise<Record<string, FigmaFileNode | null>>;
  getImages(fileKey: string, nodeIds: string[], format: FigmaImageFormat): Promise<FigmaImagesResponse>;
  getStyles(fileKey: string): Promise<FigmaStylesResponse>;
  getComponents(fileKey: string): Promise<FigmaComponentsResponse>;
  getComponentSets(fileKey: string): Promise<FigmaComponentSetsResponse>;
  getVariables(fileKey: string): Promise<FigmaVariablesResponse>;
}

export type NormalizedFigmaErrorCode =
  | 'FIGMA_BAD_REQUEST'
  | 'FIGMA_UNAUTHORIZED'
  | 'FIGMA_FORBIDDEN'
  | 'FIGMA_NOT_FOUND'
  | 'FIGMA_RATE_LIMITED'
  | 'FIGMA_TIMEOUT'
  | 'FIGMA_UPSTREAM_ERROR'
  | 'FIGMA_NETWORK_ERROR'
  | 'FIGMA_UNKNOWN_ERROR';

const DEFAULT_RETRY_DELAY_MS = 250;

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export class FigmaClientError extends AppError {
  public readonly figmaStatus?: number;
  public readonly retryable: boolean;
  public readonly endpoint: string;

  constructor(params: {
    message: string;
    code: NormalizedFigmaErrorCode;
    statusCode: number;
    endpoint: string;
    figmaStatus?: number;
    retryable?: boolean;
    details?: unknown;
  }) {
    super(params.message, params.statusCode, params.code, params.details);
    this.name = 'FigmaClientError';
    this.endpoint = params.endpoint;
    this.figmaStatus = params.figmaStatus;
    this.retryable = params.retryable ?? false;
  }
}

const sleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfterMs = (headerValue: string | null): number | null => {
  if (!headerValue) {
    return null;
  }

  const seconds = Number(headerValue);
  if (!Number.isNaN(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const date = Date.parse(headerValue);
  if (Number.isNaN(date)) {
    return null;
  }

  return Math.max(0, date - Date.now());
};

const buildRetryDelayMs = (attempt: number, retryAfterHeader: string | null): number => {
  const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
  if (retryAfterMs !== null) {
    return retryAfterMs;
  }

  return DEFAULT_RETRY_DELAY_MS * 2 ** (attempt - 1);
};

const withTimeout = async <T>(timeoutMs: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
};

export class FigmaClient implements FigmaReadClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: FetchLike;
  private readonly sleepImpl: SleepFn;
  private readonly logger: LoggerLike;

  constructor(options: FigmaClientOptions = {}) {
    const token = options.token ?? config.figmaToken;

    if (!token) {
      throw new FigmaClientError({
        message: 'FIGMA_TOKEN is not configured',
        code: 'FIGMA_UNAUTHORIZED',
        statusCode: 500,
        endpoint: 'config',
        retryable: false
      });
    }

    this.token = token;
    this.baseUrl = (options.baseUrl ?? config.figmaApiBaseUrl).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? config.figmaTimeoutMs;
    this.maxRetries = options.maxRetries ?? config.figmaMaxRetries;
    this.fetchImpl = options.fetch ?? fetch;
    this.sleepImpl = options.sleep ?? sleep;
    this.logger = options.logger ?? (defaultLogger as unknown as LoggerLike);
  }

  public getFile(fileKey: string): Promise<FigmaFileResponse> {
    return this.request<FigmaFileResponse>(`/v1/files/${encodeURIComponent(fileKey)}`);
  }

  public async getNode(fileKey: string, nodeId: string): Promise<FigmaFileNode | null> {
    const response = await this.getNodesResponse(fileKey, [nodeId]);
    return response.nodes[nodeId] ?? null;
  }

  public async getNodes(
    fileKey: string,
    nodeIds: string[]
  ): Promise<Record<string, FigmaFileNode | null>> {
    const response = await this.getNodesResponse(fileKey, nodeIds);
    return response.nodes;
  }

  public getImages(
    fileKey: string,
    nodeIds: string[],
    format: FigmaImageFormat
  ): Promise<FigmaImagesResponse> {
    return this.request<FigmaImagesResponse>(`/v1/images/${encodeURIComponent(fileKey)}`, {
      ids: this.joinNodeIds(nodeIds),
      format
    });
  }

  public getStyles(fileKey: string): Promise<FigmaStylesResponse> {
    return this.request<FigmaStylesResponse>(`/v1/files/${encodeURIComponent(fileKey)}/styles`);
  }

  public getComponents(fileKey: string): Promise<FigmaComponentsResponse> {
    return this.request<FigmaComponentsResponse>(`/v1/files/${encodeURIComponent(fileKey)}/components`);
  }

  public getComponentSets(fileKey: string): Promise<FigmaComponentSetsResponse> {
    return this.request<FigmaComponentSetsResponse>(
      `/v1/files/${encodeURIComponent(fileKey)}/component_sets`
    );
  }

  public getVariables(fileKey: string): Promise<FigmaVariablesResponse> {
    return this.request<FigmaVariablesResponse>(
      `/v1/files/${encodeURIComponent(fileKey)}/variables/local`
    );
  }

  private getNodesResponse(fileKey: string, nodeIds: string[]): Promise<FigmaNodesResponse> {
    return this.request<FigmaNodesResponse>(`/v1/files/${encodeURIComponent(fileKey)}/nodes`, {
      ids: this.joinNodeIds(nodeIds)
    });
  }

  private joinNodeIds(nodeIds: string[]): string {
    if (nodeIds.length === 0) {
      throw new FigmaClientError({
        message: 'At least one nodeId is required',
        code: 'FIGMA_BAD_REQUEST',
        statusCode: 400,
        endpoint: 'input',
        retryable: false
      });
    }

    return nodeIds.join(',');
  }

  private async request<TResponse>(
    path: string,
    query?: Record<string, string>
  ): Promise<TResponse> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt += 1) {
      try {
        this.logger.debug(
          {
            endpoint: path,
            attempt,
            timeoutMs: this.timeoutMs
          },
          'Requesting Figma API'
        );

        const response = await withTimeout(this.timeoutMs, (signal) =>
          this.fetchImpl(url, {
            method: 'GET',
            headers: {
              'X-Figma-Token': this.token,
              Accept: 'application/json'
            },
            signal
          })
        );

        const payload = await this.parseResponseBody<TResponse>(response);

        if (response.ok) {
          return payload;
        }

        const error = this.normalizeError(path, response.status, payload, response.headers);

        if (error.retryable && attempt <= this.maxRetries) {
          const delayMs = buildRetryDelayMs(attempt, response.headers.get('retry-after'));
          this.logger.warn(
            {
              endpoint: path,
              attempt,
              statusCode: response.status,
              delayMs
            },
            'Retrying Figma API request'
          );
          await this.sleepImpl(delayMs);
          continue;
        }

        throw error;
      } catch (error) {
        const normalizedError = this.normalizeThrownError(path, error);

        if (normalizedError.retryable && attempt <= this.maxRetries) {
          const delayMs = buildRetryDelayMs(attempt, null);
          this.logger.warn(
            {
              endpoint: path,
              attempt,
              statusCode: normalizedError.figmaStatus,
              delayMs
            },
            'Retrying Figma API request after transient error'
          );
          await this.sleepImpl(delayMs);
          continue;
        }

        this.logger.error(
          {
            endpoint: path,
            attempt,
            statusCode: normalizedError.figmaStatus,
            code: normalizedError.code
          },
          'Figma API request failed'
        );

        throw normalizedError;
      }
    }

    throw new FigmaClientError({
      message: 'Figma API request failed after retry exhaustion',
      code: 'FIGMA_UPSTREAM_ERROR',
      statusCode: 502,
      endpoint: path,
      retryable: false
    });
  }

  private async parseResponseBody<TResponse>(response: Response): Promise<TResponse> {
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      return (await response.json()) as TResponse;
    }

    return (await response.text()) as TResponse;
  }

  private normalizeThrownError(endpoint: string, error: unknown): FigmaClientError {
    if (error instanceof FigmaClientError) {
      return error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      return new FigmaClientError({
        message: `Figma API request timed out after ${this.timeoutMs}ms`,
        code: 'FIGMA_TIMEOUT',
        statusCode: 504,
        endpoint,
        retryable: false,
        details: { timeoutMs: this.timeoutMs }
      });
    }

    return new FigmaClientError({
      message: 'Figma API network error',
      code: 'FIGMA_NETWORK_ERROR',
      statusCode: 502,
      endpoint,
      retryable: false,
      details: error instanceof Error ? { cause: error.message } : undefined
    });
  }

  private normalizeError(
    endpoint: string,
    statusCode: number,
    payload: unknown,
    headers: Headers
  ): FigmaClientError {
    const figmaPayload = this.asFigmaErrorPayload(payload);
    const message =
      figmaPayload.message ??
      figmaPayload.err ??
      `Figma API request failed with status ${statusCode}`;

    if (statusCode === 400) {
      return new FigmaClientError({
        message,
        code: 'FIGMA_BAD_REQUEST',
        statusCode: 400,
        endpoint,
        figmaStatus: figmaPayload.status ?? statusCode,
        details: figmaPayload
      });
    }

    if (statusCode === 401) {
      return new FigmaClientError({
        message,
        code: 'FIGMA_UNAUTHORIZED',
        statusCode: 401,
        endpoint,
        figmaStatus: figmaPayload.status ?? statusCode,
        details: figmaPayload
      });
    }

    if (statusCode === 403) {
      return new FigmaClientError({
        message,
        code: 'FIGMA_FORBIDDEN',
        statusCode: 403,
        endpoint,
        figmaStatus: figmaPayload.status ?? statusCode,
        details: figmaPayload
      });
    }

    if (statusCode === 404) {
      return new FigmaClientError({
        message,
        code: 'FIGMA_NOT_FOUND',
        statusCode: 404,
        endpoint,
        figmaStatus: figmaPayload.status ?? statusCode,
        details: figmaPayload
      });
    }

    if (statusCode === 429) {
      return new FigmaClientError({
        message,
        code: 'FIGMA_RATE_LIMITED',
        statusCode: 429,
        endpoint,
        figmaStatus: figmaPayload.status ?? statusCode,
        retryable: true,
        details: {
          ...figmaPayload,
          retryAfter: headers.get('retry-after')
        }
      });
    }

    if (RETRYABLE_STATUSES.has(statusCode) || statusCode >= 500) {
      return new FigmaClientError({
        message,
        code: 'FIGMA_UPSTREAM_ERROR',
        statusCode: 502,
        endpoint,
        figmaStatus: figmaPayload.status ?? statusCode,
        retryable: RETRYABLE_STATUSES.has(statusCode) || statusCode >= 500,
        details: figmaPayload
      });
    }

    return new FigmaClientError({
      message,
      code: 'FIGMA_UNKNOWN_ERROR',
      statusCode,
      endpoint,
      figmaStatus: figmaPayload.status ?? statusCode,
      details: figmaPayload
    });
  }

  private asFigmaErrorPayload(payload: unknown): FigmaApiErrorPayload {
    if (!payload || typeof payload !== 'object') {
      return {};
    }

    return payload as FigmaApiErrorPayload;
  }
}
