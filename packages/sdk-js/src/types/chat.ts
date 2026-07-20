import type { JsonObject, RequestOptions } from "./common.js";

export interface Citation {
  chunk_id: string;
  document_id: string;
  title: string;
  url: string | null;
  snippet: string;
}

export interface RetrievalHit {
  chunk_id: string;
  document_id: string;
  score: number;
  rank: number;
}

export interface RetrievalTrace {
  original_query: string;
  rewritten_query: string | null;
  cache_hit: boolean;
  cache_similarity: number | null;
  vector_hits: RetrievalHit[];
  lexical_hits: RetrievalHit[];
  fused_hits: RetrievalHit[];
  reranked_hits: RetrievalHit[];
  confidence_score: number | null;
  confidence_threshold: number | null;
  answered: boolean;
  refusal_reason: string | null;
  timings_ms: Record<string, number>;
}

export interface ChatRequest {
  message: string;
  /** Continues an existing conversation. Omit to start a new one. */
  conversationId?: string;
  /** Stable identifier for the end user, used for analytics and rate limiting. */
  visitorId?: string;
  channel?: "widget" | "api" | "slack" | "email";
  locale?: string;
  /** Restricts retrieval to documents carrying all of these tags. */
  tags?: string[];
  /** Overrides the project system prompt for this turn. */
  systemPrompt?: string;
  /** Includes the `trace` event in the stream. Defaults to false. */
  includeTrace?: boolean;
}

export type ChatOptions = ChatRequest & RequestOptions;

export interface ConversationEvent {
  type: "conversation";
  conversationId: string;
  messageId: string;
}

export interface TokenEvent {
  type: "token";
  /** Incremental text to append to what has already been received. */
  text: string;
}

export interface CitationsEvent {
  type: "citations";
  citations: Citation[];
}

export interface TraceEvent {
  type: "trace";
  trace: RetrievalTrace;
}

export interface DoneEvent {
  type: "done";
  /** Present when the server reports why it declined to answer. */
  refusalReason: string | null;
  confidenceScore: number | null;
}

export interface ErrorEvent {
  type: "error";
  code: string;
  message: string;
}

/** An event the SDK does not model yet. Forward compatible by design. */
export interface UnknownEvent {
  type: "unknown";
  event: string;
  data: JsonObject | string;
}

export type ChatStreamEvent =
  | ConversationEvent
  | TokenEvent
  | CitationsEvent
  | TraceEvent
  | DoneEvent
  | ErrorEvent
  | UnknownEvent;

export interface ChatResult {
  answer: string;
  citations: Citation[];
  trace: RetrievalTrace | null;
  conversationId: string;
  messageId: string;
  refusalReason: string | null;
  confidenceScore: number | null;
}

export type FeedbackValue = "up" | "down";

export interface FeedbackResponse {
  message_id: string;
  feedback: FeedbackValue;
}
