"use client";

import Link from "next/link";

import { AreaChart, HBarList } from "@/components/charts";
import { PageHeader, RequireProject } from "@/components/page";
import { Button, Card, CardBody, CardHeader, SkeletonCards, StateBlock } from "@/components/ui";
import { useAuth } from "@/lib/auth/context";
import { errorMessage, useAsyncData } from "@/lib/hooks";
import { useI18n, type Locale, type TranslateFn } from "@/lib/i18n";
import { formatDecimal, formatNumber, formatPercent } from "@/lib/format";

function Metric({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <Card>
      <CardBody>
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}</div>
        {caption ? <div className="metric-caption">{caption}</div> : null}
      </CardBody>
    </Card>
  );
}

function OverviewBody({ projectId, t, locale }: { projectId: string; t: TranslateFn; locale: Locale }) {
  return (
    <div className="overview">
      <OverviewAnalytics projectId={projectId} t={t} locale={locale} />
    </div>
  );
}

function OverviewAnalytics({ projectId, t, locale }: { projectId: string; t: TranslateFn; locale: Locale }) {
  const { api } = useAuth();
  const { data, loading, error } = useAsyncData(
    () => api.analytics.get(projectId, 30, false),
    [projectId],
  );

  if (loading) return <SkeletonCards count={8} />;
  if (error) return <StateBlock title={t("common.loadFailed")} text={errorMessage(t, error)} />;
  if (!data) return <StateBlock title={t("overview.noData")} />;

  const satisfaction =
    data.satisfaction_rate === null
      ? t("common.none")
      : formatPercent(data.satisfaction_rate, locale);
  const confidence =
    data.average_confidence === null ? t("common.none") : formatDecimal(data.average_confidence);

  return (
    <>
      <div className="metric-grid">
        <Metric label={t("overview.conversations")} value={formatNumber(data.conversations, locale)} />
        <Metric label={t("overview.messages")} value={formatNumber(data.messages, locale)} />
        <Metric label={t("overview.satisfaction")} value={satisfaction} />
        <Metric label={t("overview.refusalRate")} value={formatPercent(data.refusal_rate, locale)} />
        <Metric
          label={t("overview.cacheHitRate")}
          value={formatPercent(data.cache_hit_rate, locale)}
        />
        <Metric label={t("overview.averageConfidence")} value={confidence} />
        <Metric
          label={t("overview.staleDocuments")}
          value={formatNumber(data.stale_documents, locale)}
        />
        <Metric
          label={t("overview.tokensUsed")}
          value={formatNumber(data.prompt_tokens + data.completion_tokens, locale)}
        />
      </div>

      <div className="overview-columns">
        <Card>
          <CardHeader title={t("overview.messages")} subtitle={t("overview.last30Days")} />
          <CardBody>
            <AreaChart
              ariaLabel={t("overview.messages")}
              values={data.messages_by_day.map((point) => point.value)}
              labels={data.messages_by_day.map((point) => point.date)}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("conversations.searchPlaceholder")} />
          <CardBody>
            {data.top_questions.length === 0 ? (
              <StateBlock title={t("overview.noData")} />
            ) : (
              <HBarList
                items={data.top_questions.map((question) => ({
                  label: question.question,
                  value: question.count,
                  valueLabel: String(question.count),
                }))}
              />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title={t("overview.quickActions")} />
        <CardBody>
          <div className="quick-actions">
            <Link href="/knowledge">
              <Button>{t("overview.goToKnowledge")}</Button>
            </Link>
            <Link href="/playground">
              <Button>{t("overview.goToPlayground")}</Button>
            </Link>
            <Link href="/analytics">
              <Button>{t("overview.goToAnalytics")}</Button>
            </Link>
          </div>
        </CardBody>
      </Card>
    </>
  );
}

export default function OverviewPage() {
  const { t, locale } = useI18n();
  return (
    <>
      <PageHeader title={t("overview.title")} subtitle={t("overview.subtitle")} />
      <RequireProject>
        {(projectId) => <OverviewBody projectId={projectId} t={t} locale={locale} />}
      </RequireProject>
    </>
  );
}
