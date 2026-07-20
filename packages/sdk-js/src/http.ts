import {
  createErrorFromResponse,
  ProprAIAbortError,
  ProprAIConnectionError,
  ProprAIError,
  ProprAIRateLimitError,
  ProprAIServerError,
  ProprAITimeoutError,
} from "./errors";
import type { RequestOptions } from "./types/common";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  apiKey: string;
  baseUrl: string;
  fetch?: FetchLike;
  maxRetries?: number;
  timeout?: number;
}

interface RequestConfig extends RequestOptions {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
}

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT = 30_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function backoffDelay(attempt: number, retryAfter?: number): number {
  if (retryAfter !== undefined) return retryAfter * 1000;
  const base = Math.min(1000 * 2 ** attempt, 8000);
  return base / 2 + Math.random() * (base / 2);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ProprAIAbortError("request aborted", { status: 0 }));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ProprAIAbortError("request aborted", { status: 0 }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, unknown>): string {
  const url = new URL(path.replace(/^\//, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export class HttpClient {
  private readonly fetchImpl: FetchLike;
  private readonly maxRetries: number;
  private readonly timeout: number;

  constructor(private readonly options: HttpClientOptions) {
    const globalFetch = options.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!globalFetch) {
      throw new ProprAIError("no fetch implementation available", { status: 0 });
    }
    this.fetchImpl = globalFetch.bind(globalThis);
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
  }

  private headers(extra?: Record<string, string>, json = true): Record<string, string> {
    const base: Record<string, string> = { "X-API-Key": this.options.apiKey, ...extra };
    if (json) base["Content-Type"] = "application/json";
    return base;
  }

  async raw(config: RequestConfig): Promise<Response> {
    const url = buildUrl(this.options.baseUrl, config.path, config.query);
    const maxRetries = config.maxRetries ?? this.maxRetries;
    const timeout = config.timeout ?? this.timeout;
    const isForm = config.body instanceof FormData;

    let attempt = 0;
    for (;;) {
      const controller = new AbortController();
      const onOuterAbort = () => controller.abort();
      config.signal?.addEventListener("abort", onOuterAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), timeout);

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: config.method,
          headers: this.headers(config.headers, !isForm),
          body:
            config.body === undefined
              ? undefined
              : isForm
                ? (config.body as FormData)
                : JSON.stringify(config.body),
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timer);
        config.signal?.removeEventListener("abort", onOuterAbort);
        if (config.signal?.aborted) {
          throw new ProprAIAbortError("request aborted", { status: 0 });
        }
        if (controller.signal.aborted) {
          throw new ProprAITimeoutError("request timed out", { status: 0 });
        }
        if (attempt < maxRetries) {
          await sleep(backoffDelay(attempt), config.signal);
          attempt += 1;
          continue;
        }
        throw new ProprAIConnectionError((error as Error).message, { status: 0 });
      } finally {
        clearTimeout(timer);
        config.signal?.removeEventListener("abort", onOuterAbort);
      }

      if (response.ok) return response;

      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;

      if (RETRYABLE_STATUS.has(response.status) && attempt < maxRetries) {
        await sleep(backoffDelay(attempt, retryAfter), config.signal);
        attempt += 1;
        continue;
      }

      const body = await response.json().catch(() => null);
      throw createErrorFromResponse({
        status: response.status,
        body,
        requestId: response.headers.get("x-request-id") ?? undefined,
        retryAfter,
      });
    }
  }

  async request<T>(config: RequestConfig): Promise<T> {
    const response = await this.raw(config);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  get<T>(path: string, query?: Record<string, unknown>, options?: RequestOptions): Promise<T> {
    return this.request<T>({ method: "GET", path, query, ...options });
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>({ method: "POST", path, body, ...options });
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>({ method: "PATCH", path, body, ...options });
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>({ method: "PUT", path, body, ...options });
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>({ method: "DELETE", path, ...options });
  }
}

export { ProprAIRateLimitError, ProprAIServerError };
