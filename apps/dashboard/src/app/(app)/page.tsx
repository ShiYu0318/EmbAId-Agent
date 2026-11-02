"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { HBarList } from "@/components/charts";
import { NumberTicker, Sparkline } from "@/components/motion";
import { NextActions } from "@/components/next-actions";
import { Delta, TimeSeries } from "@/components/viz";
import { PageHeader, RequireProject } from "@/components/page";
import { Button, Card, CardBody, CardHeader, SkeletonCards, StateBlock } from "@/components/ui";
import { useAuth } from "@/lib/auth/context";
import { errorMessage, useAsyncData } from "@/lib/hooks";
import { useI18n, type Locale, type TranslateFn } from "@/lib/i18n";
import { formatDecimal, formatNumber, formatPercent } from "@/lib/format";

function Metric({
  label,
  value,
  caption,
  trend,
  delta,
}: {
  label: string;
  value: ReactNode;
  caption?: string;
  trend?: number[];
  delta?: ReactNode;
}) {
  return (
    <Card className="metric-card">
      <CardBody>
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}</div>
        {delta ? <div className="kpi__delta">{delta}</div> : null}
        {trend ? <Sparkline values={trend} label={label} /> : null}
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

  const count = (n: number) => <NumberTicker value={n} format={(v) => formatNumber(Math.round(v), locale)} />;
  const percent = (n: number) => <NumberTicker value={n} format={(v) => formatPercent(v, locale)} />;
  const satisfaction = data.satisfaction_rate === null ? t("common.none") : percent(data.satisfaction_rate);
  const confidence =
    data.average_confidence === null ? (
      t("common.none")
    ) : (
      <NumberTicker value={data.average_confidence} format={(v) => formatDecimal(v)} />
    );

  return (
    <>
      <NextActions projectId={projectId} analytics={data} />
      <div className="metric-grid">
        <Metric
          label={t("overview.conversations")}
          value={count(data.conversations)}
          delta={<Delta current={data.conversations} previous={data.previous?.conversations ?? null} label={t("analytics.vsPrevious")} emptyLabel={t("analytics.noPrevious")} />}
          trend={data.conversations_by_day.map((p) => p.value)}
        />
        <Metric
          label={t("overview.messages")}
          value={count(data.messages)}
          delta={<Delta current={data.messages} previous={data.previous?.messages ?? null} label={t("analytics.vsPrevious")} emptyLabel={t("analytics.noPrevious")} />}
          trend={data.messages_by_day.map((p) => p.value)}
        />
        <Metric label={t("overview.satisfaction")} value={satisfaction} />
        <Metric label={t("overview.refusalRate")} value={percent(data.refusal_rate)} />
        <Metric label={t("overview.cacheHitRate")} value={percent(data.cache_hit_rate)} />
        <Metric label={t("overview.averageConfidence")} value={confidence} />
        <Metric label={t("overview.staleDocuments")} value={count(data.stale_documents)} />
        <Metric label={t("overview.tokensUsed")} value={count(data.prompt_tokens + data.completion_tokens)} />
      </div>

      <div className="overview-columns">
        <Card>
          <CardHeader title={t("overview.messages")} subtitle={t("overview.last30Days")} />
          <CardBody>
            <TimeSeries
              ariaLabel={t("overview.messages")}
              locale={locale}
              height={200}
              dates={data.messages_by_day.map((point) => point.date)}
              series={[
                { key: "messages", label: t("overview.messages"), colorVar: "--chart-1", values: data.messages_by_day.map((point) => point.value) },
              ]}
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
