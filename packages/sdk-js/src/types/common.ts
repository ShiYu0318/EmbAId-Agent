export type KeyType = "publishable" | "secret" | "sandbox";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** ISO 8601 timestamp, for example `2026-07-20T09:14:22.140Z`. */
export type Timestamp = string;

export type ChatProvider = "anthropic" | "openai" | "ollama";
export type EmbeddingProvider = "openai" | "ollama";

export interface ListParams {
  limit?: number;
  offset?: number;
}

export interface Page<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
  /** Extra headers merged over the client defaults for this call only. */
  headers?: Record<string, string>;
  /** Overrides the client-level retry policy for this call only. */
  maxRetries?: number;
  /** Per-request timeout in milliseconds. Overrides the client-level timeout. */
  timeout?: number;
}
