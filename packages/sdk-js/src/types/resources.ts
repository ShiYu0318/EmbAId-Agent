import type { ChatProvider, EmbeddingProvider, JsonObject, Timestamp } from "./common";

export type KeyKind = "publishable" | "secret" | "sandbox";

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
  created_at: Timestamp;
}

export interface ProjectCreateParams {
  name: string;
  template?: string;
  chat_provider?: ChatProvider;
  chat_model?: string;
  embedding_provider?: EmbeddingProvider;
  embedding_model?: string;
  default_locale?: string;
  confidence_threshold?: number;
  staleness_days?: number;
  system_prompt?: string;
}

export type ProjectUpdateParams = Partial<Omit<ProjectCreateParams, "template">>;

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
}

export interface ApiKey {
  id: string;
  project_id: string;
  name: string;
  type: KeyKind;
  key_prefix: string;
  allowed_origins: string[];
  rate_limit_per_minute: number;
  revoked_at: Timestamp | null;
  created_at: Timestamp;
}

export interface ApiKeyCreated extends ApiKey {
  key: string;
}

export interface ApiKeyCreateParams {
  type: KeyKind;
  name?: string;
  allowed_origins?: string[];
  rate_limit_per_minute?: number;
}

export interface Source {
  id: string;
  project_id: string;
  type: string;
  config: JsonObject;
  schedule: string | null;
  status: string;
  last_run_at: Timestamp | null;
  last_error: string | null;
  created_at: Timestamp;
}

export interface SourceCreateParams {
  type: "url_crawl" | "sitemap" | "notion" | "google_docs";
  config: JsonObject;
  schedule?: string;
}

export interface DocumentSummary {
  id: string;
  project_id: string;
  source_id: string | null;
  title: string;
  url: string | null;
  status: string;
  chunk_count: number;
  is_stale: boolean;
  last_verified_at: Timestamp | null;
  created_at: Timestamp;
  tags: string[];
}

export interface Tag {
  id: string;
  project_id: string;
  name: string;
  created_at: Timestamp;
}

export interface KnowledgeGap {
  id: string;
  project_id: string;
  question_text: string;
  occurrence_count: number;
  draft_answer: string | null;
  status: "open" | "draft_ready" | "resolved";
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Analytics {
  project_id: string;
  range_days: number;
  conversations: number;
  messages: number;
  refusals: number;
  refusal_rate: number;
  thumbs_up: number;
  thumbs_down: number;
  satisfaction_rate: number | null;
  cache_hit_rate: number;
  average_confidence: number | null;
  prompt_tokens: number;
  completion_tokens: number;
  stale_documents: number;
}

export interface Webhook {
  id: string;
  project_id: string;
  url: string;
  subscribed_events: string[];
  active: boolean;
  created_at: Timestamp;
}

export interface WebhookCreated extends Webhook {
  secret: string;
}

export interface WebhookCreateParams {
  url: string;
  subscribed_events: string[];
}
