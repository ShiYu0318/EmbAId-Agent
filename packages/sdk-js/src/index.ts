export { ProprAI, type ProprAIOptions } from "./client";
export {
  ProprAIError,
  ProprAIBadRequestError,
  ProprAIUnauthorizedError,
  ProprAIForbiddenError,
  ProprAINotFoundError,
  ProprAIConflictError,
  ProprAIRateLimitError,
  ProprAIProviderUnavailableError,
  ProprAIServerError,
  ProprAIConnectionError,
  ProprAITimeoutError,
  ProprAIAbortError,
  ProprAIStreamError,
  ProprAIPermissionError,
  type ProprAIErrorCode,
} from "./errors";

export type {
  ChatOptions,
  ChatRequest,
  ChatResult,
  ChatStreamEvent,
  Citation,
  ConversationEvent,
  TokenEvent,
  CitationsEvent,
  TraceEvent,
  DoneEvent,
  ErrorEvent,
  UnknownEvent,
  RetrievalTrace,
  FeedbackValue,
  FeedbackResponse,
} from "./types/chat";

export type {
  KeyType,
  ChatProvider,
  EmbeddingProvider,
  RequestOptions,
  ListParams,
  Page,
} from "./types/common";

export type * from "./types/resources";
