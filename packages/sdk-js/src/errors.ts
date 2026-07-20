import type { KeyType } from "./types/common.js";

export type ProprAIErrorCode =
  | "error"
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "conflict"
  | "rate_limited"
  | "provider_unavailable"
  | "invalid_request"
  | "connection_error"
  | "timeout"
  | "aborted"
  | "stream_error"
  | "permission_denied";

export interface ProprAIErrorOptions {
  status?: number;
  code?: ProprAIErrorCode;
  requestId?: string;
  body?: unknown;
  cause?: unknown;
}

export class ProprAIError extends Error {
  readonly status: number | undefined;
  readonly code: ProprAIErrorCode;
  readonly requestId: string | undefined;
  readonly body: unknown;

  constructor(message: string, options: ProprAIErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.status = options.status;
    this.code = options.code ?? "error";
    this.requestId = options.requestId;
    this.body = options.body;
  }
}

export class ProprAIBadRequestError extends ProprAIError {}
export class ProprAIUnauthorizedError extends ProprAIError {}
export class ProprAIForbiddenError extends ProprAIError {}
export class ProprAINotFoundError extends ProprAIError {}
export class ProprAIConflictError extends ProprAIError {}

export class ProprAIRateLimitError extends ProprAIError {
  readonly retryAfter: number | undefined;

  constructor(message: string, options: ProprAIErrorOptions & { retryAfter?: number } = {}) {
    super(message, options);
    this.retryAfter = options.retryAfter;
  }
}

export class ProprAIProviderUnavailableError extends ProprAIError {}
export class ProprAIServerError extends ProprAIError {}

export class ProprAIConnectionError extends ProprAIError {
  constructor(message: string, options: ProprAIErrorOptions = {}) {
    super(message, { code: "connection_error", ...options });
  }
}

export class ProprAITimeoutError extends ProprAIConnectionError {
  constructor(message = "request timed out", options: ProprAIErrorOptions = {}) {
    super(message, { code: "timeout", ...options });
  }
}

export class ProprAIAbortError extends ProprAIError {
  constructor(message = "request was aborted", options: ProprAIErrorOptions = {}) {
    super(message, { code: "aborted", ...options });
  }
}

export class ProprAIStreamError extends ProprAIError {
  constructor(message: string, options: ProprAIErrorOptions = {}) {
    super(message, { code: "stream_error", ...options });
  }
}

export class ProprAIPermissionError extends ProprAIError {
  readonly keyType: KeyType;
  readonly resource: string;
  readonly requiredKeyType: KeyType;

  constructor(params: { keyType: KeyType; resource: string; requiredKeyType?: KeyType }) {
    const required = params.requiredKeyType ?? "secret";
    super(
      `\`${params.resource}\` requires a ${required} key, but this client was created with a ${params.keyType} key. ` +
        `${params.keyType === "publishable" ? "Publishable keys are safe to ship to browsers and may only call the chat endpoints. " : ""}` +
        `Create the client with a ${required} key on a trusted server to use this endpoint.`,
      { code: "permission_denied" },
    );
    this.keyType = params.keyType;
    this.resource = params.resource;
    this.requiredKeyType = required;
  }
}

interface ApiErrorDetail {
  code?: string;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const KNOWN_CODES = new Set<string>([
  "error",
  "not_found",
  "unauthorized",
  "forbidden",
  "conflict",
  "rate_limited",
  "provider_unavailable",
  "invalid_request",
]);

function extractDetail(body: unknown): ApiErrorDetail {
  if (!isRecord(body)) {
    return typeof body === "string" && body.length > 0 ? { message: body } : {};
  }

  const detail = body["detail"];

  if (isRecord(detail)) {
    const code = detail["code"];
    const message = detail["message"];
    return {
      code: typeof code === "string" ? code : undefined,
      message: typeof message === "string" ? message : undefined,
    };
  }

  if (typeof detail === "string") {
    return { message: detail };
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (!isRecord(item)) return null;
        const msg = typeof item["msg"] === "string" ? item["msg"] : null;
        const loc = Array.isArray(item["loc"]) ? item["loc"].join(".") : null;
        if (msg === null) return null;
        return loc === null ? msg : `${loc}: ${msg}`;
      })
      .filter((item): item is string => item !== null);
    if (messages.length > 0) {
      return { code: "invalid_request", message: messages.join("; ") };
    }
  }

  const code = body["code"];
  const message = body["message"];
  return {
    code: typeof code === "string" ? code : undefined,
    message: typeof message === "string" ? message : undefined,
  };
}

const DEFAULT_MESSAGES: Record<number, string> = {
  400: "bad request",
  401: "authentication required",
  403: "not permitted",
  404: "resource not found",
  409: "resource already exists",
  429: "rate limit exceeded",
  503: "model provider is not configured",
};

export function createErrorFromResponse(params: {
  status: number;
  body: unknown;
  requestId?: string;
  retryAfter?: number;
}): ProprAIError {
  const { status, body, requestId, retryAfter } = params;
  const detail = extractDetail(body);
  const message = detail.message ?? DEFAULT_MESSAGES[status] ?? `request failed with status ${status}`;
  const code = (
    detail.code !== undefined && KNOWN_CODES.has(detail.code) ? detail.code : undefined
  ) as ProprAIErrorCode | undefined;

  const options: ProprAIErrorOptions = { status, body, requestId };

  switch (status) {
    case 400:
      return new ProprAIBadRequestError(message, { ...options, code: code ?? "invalid_request" });
    case 401:
      return new ProprAIUnauthorizedError(message, { ...options, code: code ?? "unauthorized" });
    case 403:
      return new ProprAIForbiddenError(message, { ...options, code: code ?? "forbidden" });
    case 404:
      return new ProprAINotFoundError(message, { ...options, code: code ?? "not_found" });
    case 409:
      return new ProprAIConflictError(message, { ...options, code: code ?? "conflict" });
    case 422:
      return new ProprAIBadRequestError(message, { ...options, code: code ?? "invalid_request" });
    case 429:
      return new ProprAIRateLimitError(message, {
        ...options,
        code: code ?? "rate_limited",
        retryAfter,
      });
    case 503:
      return new ProprAIProviderUnavailableError(message, {
        ...options,
        code: code ?? "provider_unavailable",
      });
    default:
      break;
  }

  if (status >= 500) {
    return new ProprAIServerError(message, { ...options, code: code ?? "error" });
  }

  return new ProprAIError(message, { ...options, code: code ?? "error" });
}
