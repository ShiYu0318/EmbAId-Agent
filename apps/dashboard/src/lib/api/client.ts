import { ApiError, NetworkError, parseError } from "./errors";
import type { TokenStore } from "./tokens";
import type { TokenResponse } from "./types";

export interface ApiClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  fetchImpl?: typeof fetch;
  onAuthCleared?: () => void;
}

export interface RequestOptions {
  method?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
  signal?: AbortSignal;
}

const REFRESH_PATH = "/auth/refresh";

function buildUrl(baseUrl: string, path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path.replace(/^\//, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly tokens: TokenStore;
  private readonly fetchImpl: typeof fetch;
  private readonly onAuthCleared?: () => void;
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl;
    this.tokens = options.tokens;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.onAuthCleared = options.onAuthCleared;
  }

  private async send(path: string, options: RequestOptions, accessToken: string | null): Promise<Response> {
    const headers: Record<string, string> = { ...options.headers };
    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    let body: BodyInit | undefined;

    if (options.body !== undefined && options.body !== null) {
      if (isFormData) {
        body = options.body as FormData;
      } else {
        headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
        body = JSON.stringify(options.body);
      }
    }

    if (options.auth !== false && accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const init: RequestInit = { method: options.method ?? "GET", headers };
    if (body !== undefined) init.body = body;
    if (options.signal) init.signal = options.signal;

    try {
      return await this.fetchImpl(buildUrl(this.baseUrl, path, options.query), init);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new NetworkError(error instanceof Error ? error.message : "network request failed");
    }
  }

  private async refresh(): Promise<boolean> {
    if (this.refreshInFlight) return this.refreshInFlight;

    const refreshToken = this.tokens.getRefresh();
    if (!refreshToken) return false;

    this.refreshInFlight = (async () => {
      try {
        const response = await this.send(
          REFRESH_PATH,
          { method: "POST", body: { refresh_token: refreshToken }, auth: false },
          null,
        );
        if (!response.ok) {
          this.tokens.clear();
          this.onAuthCleared?.();
          return false;
        }
        const payload = (await response.json()) as TokenResponse;
        this.tokens.setSession(payload.access_token, payload.refresh_token, payload.user);
        return true;
      } catch {
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  async raw(path: string, options: RequestOptions = {}): Promise<Response> {
    let response = await this.send(path, options, this.tokens.getAccess());

    if (response.status === 401 && options.auth !== false && path !== REFRESH_PATH) {
      const refreshed = await this.refresh();
      if (refreshed) {
        response = await this.send(path, options, this.tokens.getAccess());
      } else {
        this.tokens.clear();
        this.onAuthCleared?.();
      }
    }

    return response;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.raw(path, options);

    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");

    if (!response.ok) {
      const errorBody = isJson ? await response.json().catch(() => null) : null;
      throw parseError(response.status, errorBody);
    }

    if (!isJson) {
      return (await response.text()) as unknown as T;
    }

    return (await response.json()) as T;
  }

  get<T>(path: string, query?: RequestOptions["query"], signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, { method: "GET", query, signal });
  }

  post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, { method: "POST", body, signal });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: "PATCH", body });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: "PUT", body });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }
}

export { ApiError };
