"use client";

import { useState } from "react";

import { PageHeader, RequireProject } from "@/components/page";
import { Badge, Card, CardBody, Input, LoadingBlock, StateBlock } from "@/components/ui";
import { useAuth } from "@/lib/auth/context";
import { errorMessage, useAsyncData, useDebounced } from "@/lib/hooks";
import { useI18n, type Locale, type TranslateFn } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";

function List({ projectId, t, locale }: { projectId: string; t: TranslateFn; locale: Locale }) {
  const { api } = useAuth();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 300);
  const { data, loading, error } = useAsyncData(
    () => api.conversations.list({ project_id: projectId, q: debounced || undefined }),
    [projectId, debounced],
  );

  return (
    <Card>
      <CardBody>
        <div className="toolbar">
          <Input
            value={query}
            placeholder={t("conversations.searchPlaceholder")}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {loading ? (
          <LoadingBlock label={t("common.loading")} />
        ) : error ? (
          <StateBlock title={t("common.loadFailed")} text={errorMessage(t, error)} />
        ) : !data || data.items.length === 0 ? (
          <StateBlock title={t("conversations.noConversations")} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("common.name")}</th>
                <th>{t("conversations.channel")}</th>
                <th>{t("conversations.messagesCount", { count: "" })}</th>
                <th>{t("conversations.started")}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((conversation) => (
                <tr key={conversation.id}>
                  <td>{conversation.title ?? conversation.id}</td>
                  <td>
                    <Badge tone={conversation.is_sandbox ? "warning" : "neutral"}>
                      {conversation.is_sandbox ? t("conversations.sandbox") : conversation.channel}
                    </Badge>
                  </td>
                  <td>{conversation.message_count}</td>
                  <td>{formatDateTime(conversation.started_at, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody>
    </Card>
  );
}

export default function ConversationsPage() {
  const { t, locale } = useI18n();
  return (
    <>
      <PageHeader title={t("conversations.title")} subtitle={t("conversations.subtitle")} />
      <RequireProject>{(projectId) => <List projectId={projectId} t={t} locale={locale} />}</RequireProject>
    </>
  );
}
