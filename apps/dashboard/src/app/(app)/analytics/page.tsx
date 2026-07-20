"use client";

import { useState } from "react";

import { AreaChart, HBarList } from "@/components/charts";
import { PageHeader, RequireProject } from "@/components/page";
import { Card, CardBody, CardHeader, LoadingBlock, Select, StateBlock } from "@/components/ui";
import { useAuth } from "@/lib/auth/context";
import { errorMessage, useAsyncData } from "@/lib/hooks";
import { useI18n, type Locale, type TranslateFn } from "@/lib/i18n";
import { formatDecimal, formatNumber, formatPercent } from "@/lib/format";

function Body({ projectId, t, locale }: { projectId: string; t: TranslateFn; locale: Locale }) {
  const { api } = useAuth();
  const [days, setDays] = useState(30);
  const { data, loading, error } = useAsyncData(
    () => api.analytics.get(projectId, days, false),
    [projectId, days],
  );

  return (
    <div className="stack">
      <div className="toolbar">
        <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
          <option value="7">{t("analytics.range7")}</option>
          <option value="30">{t("analytics.range30")}</option>
          <option value="90">{t("analytics.range90")}</option>
        </Select>
      </div>

      {loading ? (
        <LoadingBlock label={t("common.loading")} />
      ) : error ? (
        <StateBlock title={t("common.loadFailed")} text={errorMessage(t, error)} />
      ) : !data ? (
        <StateBlock title={t("analytics.noData")} />
      ) : (
        <>
          <div className="analytics-grid">
            <Card>
              <CardHeader title={t("analytics.conversationVolume")} />
              <CardBody>
                <AreaChart
                  ariaLabel={t("analytics.conversationVolume")}
                  values={data.conversations_by_day.map((p) => p.value)}
                  labels={data.conversations_by_day.map((p) => p.date)}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={t("analytics.messageVolume")} />
              <CardBody>
                <AreaChart
                  ariaLabel={t("analytics.messageVolume")}
                  values={data.messages_by_day.map((p) => p.value)}
                  labels={data.messages_by_day.map((p) => p.date)}
                  colorVar="--chart-2"
                />
              </CardBody>
            </Card>
          </div>

          <div className="metric-grid">
            <Card>
              <CardBody>
                <div className="metric-label">{t("analytics.satisfaction")}</div>
                <div className="metric-value">
                  {data.satisfaction_rate === null
                    ? t("common.none")
                    : formatPercent(data.satisfaction_rate, locale)}
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <div className="metric-label">{t("analytics.refusalRate")}</div>
                <div className="metric-value">{formatPercent(data.refusal_rate, locale)}</div>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <div className="metric-label">{t("analytics.cacheHitRate")}</div>
                <div className="metric-value">{formatPercent(data.cache_hit_rate, locale)}</div>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <div className="metric-label">{t("analytics.averageConfidence")}</div>
                <div className="metric-value">
                  {data.average_confidence === null
                    ? t("common.none")
                    : formatDecimal(data.average_confidence)}
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <div className="metric-label">{t("analytics.tokenUsage")}</div>
                <div className="metric-value">
                  {formatNumber(data.prompt_tokens + data.completion_tokens, locale)}
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <div className="metric-label">{t("analytics.staleDocuments")}</div>
                <div className="metric-value">{formatNumber(data.stale_documents, locale)}</div>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title={t("analytics.topQuestions")} />
            <CardBody>
              {data.top_questions.length === 0 ? (
                <StateBlock title={t("analytics.noData")} />
              ) : (
                <HBarList
                  items={data.top_questions.map((q) => ({ label: q.question, value: q.count, valueLabel: String(q.count) }))}
                />
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const { t, locale } = useI18n();
  return (
    <>
      <PageHeader title={t("analytics.title")} subtitle={t("analytics.subtitle")} />
      <RequireProject>{(projectId) => <Body projectId={projectId} t={t} locale={locale} />}</RequireProject>
    </>
  );
}
