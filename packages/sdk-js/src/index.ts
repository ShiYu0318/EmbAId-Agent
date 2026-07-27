export { EmbAId, type EmbAIdOptions } from "./client";
export {
  EmbAIdError,
  EmbAIdBadRequestError,
  EmbAIdUnauthorizedError,
  EmbAIdForbiddenError,
  EmbAIdNotFoundError,
  EmbAIdConflictError,
  EmbAIdRateLimitError,
  EmbAIdProviderUnavailableError,
  EmbAIdServerError,
  EmbAIdConnectionError,
  EmbAIdTimeoutError,
  EmbAIdAbortError,
  EmbAIdStreamError,
  EmbAIdPermissionError,
  type EmbAIdErrorCode,
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
