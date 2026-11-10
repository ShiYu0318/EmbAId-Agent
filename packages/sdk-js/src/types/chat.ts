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

/** A retrieval stage has started, e.g. `searching` or `generating`. */
export interface StatusEvent {
  type: "status";
  stage: string;
  /** Everything the server sent with the stage, including `stage` itself. */
  detail: JsonObject;
}

/** Suggested follow-up choices the visitor can pick instead of typing. */
export interface QuickRepliesEvent {
  type: "quick_replies";
  items: string[];
}

export interface DoneEvent {
  type: "done";
  /** False when the assistant declined to answer. */
  answered: boolean;
  /** Evidence score of the answer; null when it was served from the semantic cache. */
  confidence: number | null;
  /** True when the question was logged as a knowledge gap. */
  flagged: boolean;
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
  | StatusEvent
  | TokenEvent
  | QuickRepliesEvent
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
  /** False when the assistant declined to answer. */
  answered: boolean;
  /** True when the question was logged as a knowledge gap. */
  flagged: boolean;
  quickReplies: string[];
  /** Why the assistant declined, taken from the retrieval trace. */
  refusalReason: string | null;
  confidenceScore: number | null;
}

export type FeedbackValue = "up" | "down";

export interface FeedbackResponse {
  message_id: string;
  feedback: FeedbackValue;
}
