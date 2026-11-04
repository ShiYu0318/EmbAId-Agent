export type ChatProvider =
  | "anthropic"
  | "openai"
  | "ollama"
  | "openrouter"
  | "groq"
  | "gemini"
  | "deepseek"
  | "openai_compatible"
  | "azure_openai"
  | "bedrock"
  | "vertex";
export type EmbeddingProvider =
  | "openai"
  | "ollama"
  | "gemini"
  | "openai_compatible"
  | "azure_openai"
  | "bedrock"
  | "vertex";
export type ApiKeyType = "publishable" | "secret" | "sandbox";
export type SourceType = "url_crawl" | "sitemap" | "notion" | "google_docs";
export type DocumentStatus = "pending" | "processing" | "ready" | "failed";
export type GapStatus = "open" | "draft_ready" | "resolved";
export type FeedbackValue = "up" | "down";

export interface AuthUser {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  locale: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AuthUser;
}

export interface SignupBody {
  email: string;
  password: string;
  display_name?: string;
  organization_name?: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface Project {
  id: string;
  org_id: string;
  name: string;
  template: string | null;
  system_prompt: string | null;
  chat_provider: ChatProvider;
  chat_model: string;
  embedding_provider: EmbeddingProvider;
  embedding_model: string;
  default_locale: string;
  widget_config: WidgetConfig;
  confidence_threshold: number;
  staleness_days: number;
  created_at: string;
}

export interface ProjectCreateBody {
  name: string;
  template?: string | null;
  system_prompt?: string | null;
  chat_provider?: ChatProvider;
  chat_model?: string;
  embedding_provider?: EmbeddingProvider;
  embedding_model?: string;
  default_locale?: string;
  confidence_threshold?: number;
  staleness_days?: number;
}

export interface ProjectUpdateBody {
  name?: string;
  system_prompt?: string | null;
  chat_provider?: ChatProvider;
  chat_model?: string;
  embedding_provider?: EmbeddingProvider;
  embedding_model?: string;
  default_locale?: string;
  confidence_threshold?: number;
  staleness_days?: number;
}

export interface WidgetConfig {
  greeting: string;
  suggested_questions: string[];
  bot_name: string;
  bot_avatar_url: string | null;
  persona: string;
  accent_color: string;
}

export interface ProjectTemplate {
  key: string;
  name: string;
  description: string;
  system_prompt: string;
  greeting: string;
  suggested_questions: string[];
  bot_name: string;
  persona: string;
}

export interface ApiKey {
  id: string;
  project_id: string;
  name: string;
  type: ApiKeyType;
  key_prefix: string;
  allowed_origins: string[];
  rate_limit_per_minute: number;
  revoked_at: string | null;
  created_at: string;
}

export interface ApiKeyCreated extends ApiKey {
  key: string;
}

export interface ApiKeyCreateBody {
  type: ApiKeyType;
  name: string;
  allowed_origins?: string[];
  rate_limit_per_minute?: number;
}

export interface ApiKeyUpdateBody {
  name?: string;
  allowed_origins?: string[];
  rate_limit_per_minute?: number;
}

export interface Source {
  id: string;
  project_id: string;
  type: string;
  config: Record<string, unknown>;
  schedule: string | null;
  status: string;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface SourceCreateBody {
  type: SourceType;
  config: Record<string, unknown>;
  schedule?: string | null;
}

export interface DocumentSummary {
  id: string;
  project_id: string;
  source_id: string | null;
  title: string;
  url: string | null;
  status: string;
  error: string | null;
  enabled: boolean;
  chunk_count: number;
  token_count: number;
  is_stale: boolean;
  last_verified_at: string | null;
  created_at: string;
  tags: string[];
}

export interface DocumentUpdateBody {
  title?: string;
  enabled?: boolean;
}

export interface DocumentChunk {
  id: string;
  ordinal: number;
  content: string;
  trust_score: number;
}

export interface DocumentDetail extends DocumentSummary {
  chunks: DocumentChunk[];
}

export interface Tag {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
}

export interface Citation {
  chunk_id: string;
  document_id: string;
  title: string;
  url: string | null;
  snippet: string;
}

export interface MessageCitations {
  items: Citation[];
}

export interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  citations: MessageCitations | Record<string, never>;
  confidence_score: number | null;
  feedback: FeedbackValue | null;
  prompt_tokens: number;
  completion_tokens: number;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  project_id: string;
  channel: string;
  visitor_id: string | null;
  is_sandbox: boolean;
  title: string | null;
  locale: string;
  started_at: string;
  last_message_at: string;
  message_count: number;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ConversationMessage[];
}

export interface ConversationPage {
  items: ConversationSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface ConversationQuery {
  project_id: string;
  channel?: string;
  is_sandbox?: boolean;
  start?: string;
  end?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface VectorHit {
  chunk_id: string;
  document_id: string;
  score: number;
  rank: number;
}

export interface FusedHit {
  chunk_id: string;
  document_id: string;
  rrf_score: number;
  score: number;
  vector_rank: number | null;
  lexical_rank: number | null;
  trust_score: number;
  is_stale: boolean;
}

export interface RerankedHit {
  chunk_id: string;
  document_id: string;
  rerank_score: number;
}

export interface RetrievalTrace {
  original_query: string;
  rewritten_query: string | null;
  cache_hit: boolean;
  cache_similarity: number | null;
  vector_hits: VectorHit[];
  lexical_hits: VectorHit[];
  fused_hits: FusedHit[];
  reranked_hits: RerankedHit[];
  confidence_score: number | null;
  confidence_threshold: number | null;
  answered: boolean;
  refusal_reason: string | null;
  timings_ms: Record<string, number>;
}

export interface TracePayload {
  message_id: string;
  conversation_id: string;
  confidence_score: number | null;
  created_at: string;
  trace: RetrievalTrace;
}

export interface KnowledgeGap {
  id: string;
  project_id: string;
  question_text: string;
  occurrence_count: number;
  draft_answer: string | null;
  status: GapStatus;
  created_at: string;
  updated_at: string;
}

export interface GapDraft {
  id: string;
  draft_answer: string;
  status: string;
}

export interface GapApproved {
  id: string;
  status: string;
  document_id: string;
}

export interface DailyPoint {
  date: string;
  value: number;
}

export interface TopQuestion {
  question: string;
  count: number;
}

export interface Analytics {
  project_id: string;
  range_days: number;
  conversations: number;
  messages: number;
  questions: number;
  answers: number;
  refusals: number;
  refusal_rate: number;
  thumbs_up: number;
  thumbs_down: number;
  satisfaction_rate: number | null;
  cache_hits: number;
  cache_hit_rate: number;
  average_confidence: number | null;
  prompt_tokens: number;
  completion_tokens: number;
  stale_documents: number;
  conversations_by_day: DailyPoint[];
  messages_by_day: DailyPoint[];
  top_questions: TopQuestion[];
  answers_by_day: DailyPoint[];
  refusals_by_day: DailyPoint[];
  confidence_threshold: number;
  confidence_histogram: number[];
  channels: { label: string; count: number }[];
  previous: {
    conversations: number;
    messages: number;
    answers: number;
    refusal_rate: number;
    satisfaction_rate: number | null;
    average_confidence: number | null;
  } | null;
}

export interface Webhook {
  id: string;
  project_id: string;
  url: string;
  subscribed_events: string[];
  active: boolean;
  created_at: string;
}

export interface WebhookCreated extends Webhook {
  secret: string;
}

export interface WebhookCreateBody {
  url: string;
  subscribed_events: string[];
}

export interface WebhookUpdateBody {
  url?: string;
  subscribed_events?: string[];
  active?: boolean;
}

export interface WebhookDelivery {
  id: string;
  endpoint_id: string;
  event: string;
  status_code: number | null;
  attempts: number;
  error: string | null;
  created_at: string;
}

export interface UploadResult {
  document_id: string;
  status: string;
}
