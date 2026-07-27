import type { KeyType } from "./types/common.js";

export type EmbAIdErrorCode =
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

export interface EmbAIdErrorOptions {
  status?: number;
  code?: EmbAIdErrorCode;
  requestId?: string;
  body?: unknown;
  cause?: unknown;
}

export class EmbAIdError extends Error {
  readonly status: number | undefined;
  readonly code: EmbAIdErrorCode;
  readonly requestId: string | undefined;
  readonly body: unknown;

  constructor(message: string, options: EmbAIdErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.status = options.status;
    this.code = options.code ?? "error";
    this.requestId = options.requestId;
    this.body = options.body;
  }
}

export class EmbAIdBadRequestError extends EmbAIdError {}
export class EmbAIdUnauthorizedError extends EmbAIdError {}
export class EmbAIdForbiddenError extends EmbAIdError {}
export class EmbAIdNotFoundError extends EmbAIdError {}
export class EmbAIdConflictError extends EmbAIdError {}

export class EmbAIdRateLimitError extends EmbAIdError {
  readonly retryAfter: number | undefined;

  constructor(message: string, options: EmbAIdErrorOptions & { retryAfter?: number } = {}) {
    super(message, options);
    this.retryAfter = options.retryAfter;
  }
}

export class EmbAIdProviderUnavailableError extends EmbAIdError {}
export class EmbAIdServerError extends EmbAIdError {}

export class EmbAIdConnectionError extends EmbAIdError {
  constructor(message: string, options: EmbAIdErrorOptions = {}) {
    super(message, { code: "connection_error", ...options });
  }
}

export class EmbAIdTimeoutError extends EmbAIdConnectionError {
  constructor(message = "request timed out", options: EmbAIdErrorOptions = {}) {
    super(message, { code: "timeout", ...options });
  }
}

export class EmbAIdAbortError extends EmbAIdError {
  constructor(message = "request was aborted", options: EmbAIdErrorOptions = {}) {
    super(message, { code: "aborted", ...options });
  }
}

export class EmbAIdStreamError extends EmbAIdError {
  constructor(message: string, options: EmbAIdErrorOptions = {}) {
    super(message, { code: "stream_error", ...options });
  }
}

export class EmbAIdPermissionError extends EmbAIdError {
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
}): EmbAIdError {
  const { status, body, requestId, retryAfter } = params;
  const detail = extractDetail(body);
  const message = detail.message ?? DEFAULT_MESSAGES[status] ?? `request failed with status ${status}`;
  const code = (
    detail.code !== undefined && KNOWN_CODES.has(detail.code) ? detail.code : undefined
  ) as EmbAIdErrorCode | undefined;

  const options: EmbAIdErrorOptions = { status, body, requestId };

  switch (status) {
    case 400:
      return new EmbAIdBadRequestError(message, { ...options, code: code ?? "invalid_request" });
    case 401:
      return new EmbAIdUnauthorizedError(message, { ...options, code: code ?? "unauthorized" });
    case 403:
      return new EmbAIdForbiddenError(message, { ...options, code: code ?? "forbidden" });
    case 404:
      return new EmbAIdNotFoundError(message, { ...options, code: code ?? "not_found" });
    case 409:
      return new EmbAIdConflictError(message, { ...options, code: code ?? "conflict" });
    case 422:
      return new EmbAIdBadRequestError(message, { ...options, code: code ?? "invalid_request" });
    case 429:
      return new EmbAIdRateLimitError(message, {
        ...options,
        code: code ?? "rate_limited",
        retryAfter,
      });
    case 503:
      return new EmbAIdProviderUnavailableError(message, {
        ...options,
        code: code ?? "provider_unavailable",
      });
    default:
      break;
  }

  if (status >= 500) {
    return new EmbAIdServerError(message, { ...options, code: code ?? "error" });
  }

  return new EmbAIdError(message, { ...options, code: code ?? "error" });
}
