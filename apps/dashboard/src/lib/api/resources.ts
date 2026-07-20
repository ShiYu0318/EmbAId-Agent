import type { ApiClient } from "./client";
import type {
  Analytics,
  ApiKey,
  ApiKeyCreateBody,
  ApiKeyCreated,
  ApiKeyUpdateBody,
  ConversationDetail,
  ConversationPage,
  ConversationQuery,
  DocumentDetail,
  DocumentSummary,
  KnowledgeGap,
  GapApproved,
  GapDraft,
  LoginBody,
  Project,
  ProjectCreateBody,
  ProjectTemplate,
  ProjectUpdateBody,
  SignupBody,
  Source,
  SourceCreateBody,
  Tag,
  TokenResponse,
  TracePayload,
  UploadResult,
  Webhook,
  WebhookCreateBody,
  WebhookCreated,
  WebhookDelivery,
  WebhookUpdateBody,
  WidgetConfig,
} from "./types";

export function createApi(client: ApiClient) {
  return {
    auth: {
      signup: (body: SignupBody) => client.post<TokenResponse>("/auth/signup", body),
      login: (body: LoginBody) => client.post<TokenResponse>("/auth/login", body),
      me: () => client.get<TokenResponse["user"]>("/auth/me"),
    },

    projects: {
      list: () => client.get<Project[]>("/v1/projects"),
      get: (id: string) => client.get<Project>(`/v1/projects/${id}`),
      create: (body: ProjectCreateBody) => client.post<Project>("/v1/projects", body),
      update: (id: string, body: ProjectUpdateBody) => client.patch<Project>(`/v1/projects/${id}`, body),
      remove: (id: string) => client.delete<void>(`/v1/projects/${id}`),
      templates: () => client.get<ProjectTemplate[]>("/v1/project-templates"),
      getWidgetConfig: (id: string) => client.get<WidgetConfig>(`/v1/projects/${id}/widget-config`),
      putWidgetConfig: (id: string, body: WidgetConfig) =>
        client.put<WidgetConfig>(`/v1/projects/${id}/widget-config`, body),
      reindex: (id: string) => client.post<{ project_id: string; status: string }>(`/v1/projects/${id}/reindex`),
    },

    apiKeys: {
      list: (projectId: string) => client.get<ApiKey[]>(`/v1/projects/${projectId}/api-keys`),
      create: (projectId: string, body: ApiKeyCreateBody) =>
        client.post<ApiKeyCreated>(`/v1/projects/${projectId}/api-keys`, body),
      update: (projectId: string, keyId: string, body: ApiKeyUpdateBody) =>
        client.patch<ApiKey>(`/v1/projects/${projectId}/api-keys/${keyId}`, body),
      revoke: (projectId: string, keyId: string) =>
        client.delete<void>(`/v1/projects/${projectId}/api-keys/${keyId}`),
    },

    sources: {
      list: (projectId: string) => client.get<Source[]>(`/v1/projects/${projectId}/sources`),
      create: (projectId: string, body: SourceCreateBody) =>
        client.post<Source>(`/v1/projects/${projectId}/sources`, body),
      get: (id: string) => client.get<Source>(`/v1/sources/${id}`),
      remove: (id: string) => client.delete<void>(`/v1/sources/${id}`),
      reindex: (id: string) => client.post<Source>(`/v1/sources/${id}/reindex`),
    },

    documents: {
      list: (
        projectId: string,
        query?: { status?: string; stale_only?: boolean; limit?: number; offset?: number },
      ) => client.get<DocumentSummary[]>(`/v1/projects/${projectId}/documents`, query),
      get: (id: string) => client.get<DocumentDetail>(`/v1/documents/${id}`),
      remove: (id: string) => client.delete<void>(`/v1/documents/${id}`),
      verify: (id: string) => client.post<DocumentSummary>(`/v1/documents/${id}/verify`),
      setTags: (id: string, tagIds: string[]) =>
        client.put<DocumentSummary>(`/v1/documents/${id}/tags`, { tag_ids: tagIds }),
      upload: (projectId: string, file: File, title?: string) => {
        const form = new FormData();
        form.append("file", file);
        if (title) form.append("title", title);
        return client.request<UploadResult>(`/v1/projects/${projectId}/documents/upload`, {
          method: "POST",
          body: form,
        });
      },
    },

    tags: {
      list: (projectId: string) => client.get<Tag[]>(`/v1/projects/${projectId}/tags`),
      create: (projectId: string, name: string) => client.post<Tag>(`/v1/projects/${projectId}/tags`, { name }),
      update: (id: string, name: string) => client.patch<Tag>(`/v1/tags/${id}`, { name }),
      remove: (id: string) => client.delete<void>(`/v1/tags/${id}`),
    },

    conversations: {
      list: (query: ConversationQuery) => client.get<ConversationPage>("/v1/conversations", { ...query }),
      get: (id: string) => client.get<ConversationDetail>(`/v1/conversations/${id}`),
      remove: (id: string) => client.delete<void>(`/v1/conversations/${id}`),
      exportUrl: (query: ConversationQuery) => query,
    },

    messages: {
      trace: (messageId: string) => client.get<TracePayload>(`/v1/messages/${messageId}/trace`),
    },

    knowledgeGaps: {
      list: (projectId: string, status?: string) =>
        client.get<KnowledgeGap[]>(`/v1/projects/${projectId}/knowledge-gaps`, status ? { status } : undefined),
      draft: (id: string) => client.post<GapDraft>(`/v1/knowledge-gaps/${id}/draft-answer`),
      approve: (id: string, body: { answer?: string; title?: string }) =>
        client.post<GapApproved>(`/v1/knowledge-gaps/${id}/approve`, body),
      dismiss: (id: string) => client.delete<void>(`/v1/knowledge-gaps/${id}`),
    },

    analytics: {
      get: (projectId: string, days: number, includeSandbox: boolean) =>
        client.get<Analytics>(`/v1/projects/${projectId}/analytics`, {
          days,
          include_sandbox: includeSandbox,
        }),
    },

    webhooks: {
      list: (projectId: string) => client.get<Webhook[]>(`/v1/projects/${projectId}/webhooks`),
      create: (projectId: string, body: WebhookCreateBody) =>
        client.post<WebhookCreated>(`/v1/projects/${projectId}/webhooks`, body),
      update: (id: string, body: WebhookUpdateBody) => client.patch<Webhook>(`/v1/webhooks/${id}`, body),
      remove: (id: string) => client.delete<void>(`/v1/webhooks/${id}`),
      test: (id: string) => client.post<WebhookDelivery>(`/v1/webhooks/${id}/test`),
      deliveries: (id: string) => client.get<WebhookDelivery[]>(`/v1/webhooks/${id}/deliveries`),
      events: () => client.get<string[]>("/v1/webhook-events"),
    },
  };
}

export type Api = ReturnType<typeof createApi>;
