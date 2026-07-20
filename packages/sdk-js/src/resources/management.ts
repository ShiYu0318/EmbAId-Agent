import type { HttpClient } from "../http";
import type { RequestOptions } from "../types/common";
import type {
  Analytics,
  ApiKey,
  ApiKeyCreated,
  ApiKeyCreateParams,
  DocumentSummary,
  KnowledgeGap,
  Project,
  ProjectCreateParams,
  ProjectTemplate,
  ProjectUpdateParams,
  Source,
  SourceCreateParams,
  Tag,
  Webhook,
  WebhookCreated,
  WebhookCreateParams,
  WidgetConfig,
} from "../types/resources";

export class ManagementResources {
  constructor(
    private readonly http: HttpClient,
    private readonly projectId: string,
  ) {}

  readonly projects = {
    list: (o?: RequestOptions) => this.http.get<Project[]>("/v1/projects", undefined, o),
    get: (id: string, o?: RequestOptions) => this.http.get<Project>(`/v1/projects/${id}`, undefined, o),
    create: (params: ProjectCreateParams, o?: RequestOptions) =>
      this.http.post<Project>("/v1/projects", params, o),
    update: (id: string, params: ProjectUpdateParams, o?: RequestOptions) =>
      this.http.patch<Project>(`/v1/projects/${id}`, params, o),
    remove: (id: string, o?: RequestOptions) => this.http.delete<void>(`/v1/projects/${id}`, o),
    templates: (o?: RequestOptions) =>
      this.http.get<ProjectTemplate[]>("/v1/project-templates", undefined, o),
    getWidgetConfig: (id: string, o?: RequestOptions) =>
      this.http.get<WidgetConfig>(`/v1/projects/${id}/widget-config`, undefined, o),
    updateWidgetConfig: (id: string, config: WidgetConfig, o?: RequestOptions) =>
      this.http.put<WidgetConfig>(`/v1/projects/${id}/widget-config`, config, o),
  };

  readonly apiKeys = {
    list: (o?: RequestOptions) =>
      this.http.get<ApiKey[]>(`/v1/projects/${this.projectId}/api-keys`, undefined, o),
    create: (params: ApiKeyCreateParams, o?: RequestOptions) =>
      this.http.post<ApiKeyCreated>(`/v1/projects/${this.projectId}/api-keys`, params, o),
    revoke: (keyId: string, o?: RequestOptions) => this.http.delete<void>(`/v1/api-keys/${keyId}`, o),
  };

  readonly sources = {
    list: (o?: RequestOptions) =>
      this.http.get<Source[]>(`/v1/projects/${this.projectId}/sources`, undefined, o),
    create: (params: SourceCreateParams, o?: RequestOptions) =>
      this.http.post<Source>(`/v1/projects/${this.projectId}/sources`, params, o),
    get: (id: string, o?: RequestOptions) => this.http.get<Source>(`/v1/sources/${id}`, undefined, o),
    remove: (id: string, o?: RequestOptions) => this.http.delete<void>(`/v1/sources/${id}`, o),
    reindex: (id: string, o?: RequestOptions) => this.http.post<Source>(`/v1/sources/${id}/reindex`, undefined, o),
  };

  readonly documents = {
    list: (query?: { status?: string; stale_only?: boolean }, o?: RequestOptions) =>
      this.http.get<DocumentSummary[]>(`/v1/projects/${this.projectId}/documents`, query, o),
    get: (id: string, o?: RequestOptions) =>
      this.http.get<DocumentSummary>(`/v1/documents/${id}`, undefined, o),
    remove: (id: string, o?: RequestOptions) => this.http.delete<void>(`/v1/documents/${id}`, o),
    verify: (id: string, o?: RequestOptions) =>
      this.http.post<DocumentSummary>(`/v1/documents/${id}/verify`, undefined, o),
    setTags: (id: string, tagIds: string[], o?: RequestOptions) =>
      this.http.put<DocumentSummary>(`/v1/documents/${id}/tags`, { tag_ids: tagIds }, o),
  };

  readonly tags = {
    list: (o?: RequestOptions) =>
      this.http.get<Tag[]>(`/v1/projects/${this.projectId}/tags`, undefined, o),
    create: (name: string, o?: RequestOptions) =>
      this.http.post<Tag>(`/v1/projects/${this.projectId}/tags`, { name }, o),
    remove: (id: string, o?: RequestOptions) => this.http.delete<void>(`/v1/tags/${id}`, o),
  };

  readonly knowledgeGaps = {
    list: (status?: string, o?: RequestOptions) =>
      this.http.get<KnowledgeGap[]>(
        `/v1/projects/${this.projectId}/knowledge-gaps`,
        status ? { status } : undefined,
        o,
      ),
    draftAnswer: (id: string, o?: RequestOptions) =>
      this.http.post<{ id: string; draft_answer: string; status: string }>(
        `/v1/knowledge-gaps/${id}/draft-answer`,
        undefined,
        o,
      ),
    approve: (id: string, params: { answer?: string; title?: string }, o?: RequestOptions) =>
      this.http.post<{ id: string; status: string; document_id: string }>(
        `/v1/knowledge-gaps/${id}/approve`,
        params,
        o,
      ),
    dismiss: (id: string, o?: RequestOptions) =>
      this.http.delete<void>(`/v1/knowledge-gaps/${id}`, o),
  };

  readonly analytics = {
    get: (params?: { days?: number; include_sandbox?: boolean }, o?: RequestOptions) =>
      this.http.get<Analytics>(`/v1/projects/${this.projectId}/analytics`, params, o),
  };

  readonly webhooks = {
    list: (o?: RequestOptions) =>
      this.http.get<Webhook[]>(`/v1/projects/${this.projectId}/webhooks`, undefined, o),
    create: (params: WebhookCreateParams, o?: RequestOptions) =>
      this.http.post<WebhookCreated>(`/v1/projects/${this.projectId}/webhooks`, params, o),
    remove: (id: string, o?: RequestOptions) => this.http.delete<void>(`/v1/webhooks/${id}`, o),
    test: (id: string, o?: RequestOptions) =>
      this.http.post<unknown>(`/v1/webhooks/${id}/test`, undefined, o),
  };
}
