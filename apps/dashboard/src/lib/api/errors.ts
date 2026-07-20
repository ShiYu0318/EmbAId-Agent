export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

interface ErrorEnvelope {
  detail?: { code?: string; message?: string } | string;
}

export function parseError(status: number, body: unknown): ApiError {
  if (body && typeof body === "object") {
    const detail = (body as ErrorEnvelope).detail;
    if (detail && typeof detail === "object") {
      return new ApiError(status, detail.code ?? "error", detail.message ?? "request failed");
    }
    if (typeof detail === "string") {
      return new ApiError(status, "error", detail);
    }
  }
  return new ApiError(status, "error", `request failed with status ${status}`);
}
