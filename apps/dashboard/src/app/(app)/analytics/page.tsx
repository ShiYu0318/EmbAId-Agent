"use client";

import { useState, type ReactNode } from "react";

import { HBarList } from "@/components/charts";
import { NumberTicker } from "@/components/motion";
import { PageHeader, RequireProject } from "@/components/page";
import { Card, CardBody, CardHeader, LoadingBlock, StateBlock } from "@/components/ui";
import { DataTable, Delta, Histogram, SegmentBar, StackedColumns, TimeSeries } from "@/components/viz";
import type { Analytics } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/context";
import { formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import { errorMessage, useAsyncData } from "@/lib/hooks";
import { useI18n, type Locale, type TranslateFn } from "@/lib/i18n";

const RANGES = [7, 30, 90] as const;
const CHANNEL_COLORS: Record<string, string> = { widget: "--chart-1", dashboard: "--chart-3", api: "--chart-5" };

function Kpi({
  label,
  value,
  delta,
}: {
  label: string;
  value: ReactNode;
  delta: ReactNode;
}) {
  return (
    <Card className="kpi">
      <CardBody>
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}</div>
        <div className="kpi__delta">{delta}</div>
      </CardBody>
    </Card>
  );
}

function Report({ data, t, locale }: { data: Analytics; t: TranslateFn; locale: Locale }) {
  const prev = data.previous;
  const dates = data.conversations_by_day.map((p) => p.date);
  const answerRate = data.answers ? 1 - data.refusal_rate : null;
  const prevAnswerRate = prev && prev.answers ? 1 - prev.refusal_rate : null;
  const vs = t("analytics.vsPrevious");
  const channelName = (label: string) =>
    label === "widget" ? t("analytics.channelWidget") : label === "dashboard" ? t("analytics.channelDashboard") : t("analytics.channelApi");

  return (
    <>
      <div className="kpi-grid">
        <Kpi
          label={t("analytics.conversations")}
          value={<NumberTicker value={data.conversations} format={(v) => formatNumber(Math.round(v), locale)} />}
          delta={<Delta current={data.conversations} previous={prev?.conversations ?? null} label={vs} emptyLabel={t("analytics.noPrevious")} />}
        />
        <Kpi
          label={t("analytics.answerRate")}
          value={answerRate === null ? t("common.none") : <NumberTicker value={answerRate} format={(v) => formatPercent(v, locale)} />}
          delta={<Delta current={answerRate} previous={prevAnswerRate} label={vs} emptyLabel={t("analytics.noPrevious")} points />}
        />
        <Kpi
          label={t("analytics.satisfaction")}
          value={data.satisfaction_rate === null ? t("common.none") : <NumberTicker value={data.satisfaction_rate} format={(v) => formatPercent(v, locale)} />}
          delta={<Delta current={data.satisfaction_rate} previous={prev?.satisfaction_rate ?? null} label={vs} emptyLabel={t("analytics.noPrevious")} points />}
        />
        <Kpi
          label={t("analytics.averageConfidence")}
          value={data.average_confidence === null ? t("common.none") : <NumberTicker value={data.average_confidence} format={(v) => formatDecimal(v)} />}
          delta={<Delta current={data.average_confidence} previous={prev?.average_confidence ?? null} label={vs} emptyLabel={t("analytics.noPrevious")} />}
        />
      </div>

      <div className="viz-grid">
        <Card className="viz-span-2">
          <CardHeader title={t("analytics.volume")} subtitle={t(`analytics.range${data.range_days}`)} />
          <CardBody>
            <TimeSeries
              ariaLabel={t("analytics.volume")}
              locale={locale}
              dates={dates}
              series={[
                { key: "conversations", label: t("analytics.conversations"), colorVar: "--chart-1", values: data.conversations_by_day.map((p) => p.value) },
                { key: "messages", label: t("analytics.messages"), colorVar: "--chart-2", values: data.messages_by_day.map((p) => p.value) },
              ]}
            />
            <DataTable
              caption={t("analytics.showTable")}
              columns={[t("analytics.date"), t("analytics.conversations"), t("analytics.messages")]}
              rows={dates.map((d, i) => [d, data.conversations_by_day[i]?.value ?? 0, data.messages_by_day[i]?.value ?? 0])}
            />
          </CardBody>
        </Card>

        <Card className="viz-span-2">
          <CardHeader title={t("analytics.answerQuality")} />
          <CardBody>
            <StackedColumns
              ariaLabel={t("analytics.answerQuality")}
              locale={locale}
              dates={data.answers_by_day.map((p) => p.date)}
              series={[
                { key: "answered", label: t("analytics.answered"), colorVar: "--chart-1", values: data.answers_by_day.map((p) => p.value) },
                { key: "refused", label: t("analytics.refused"), colorVar: "--chart-4", values: data.refusals_by_day.map((p) => p.value) },
              ]}
            />
            <DataTable
              caption={t("analytics.showTable")}
              columns={[t("analytics.date"), t("analytics.answered"), t("analytics.refused")]}
              rows={data.answers_by_day.map((p, i) => [p.date, p.value, data.refusals_by_day[i]?.value ?? 0])}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("analytics.confidenceDist")} subtitle={t("analytics.confidenceHint")} />
          <CardBody>
            <Histogram
              ariaLabel={t("analytics.confidenceDist")}
              counts={data.confidence_histogram}
              threshold={data.confidence_threshold}
              labels={{
                below: t("analytics.belowThreshold"),
                above: t("analytics.aboveThreshold"),
                threshold: t("analytics.threshold"),
                count: t("analytics.answersUnit"),
              }}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("analytics.channels")} />
          <CardBody>
            {data.channels.length === 0 ? (
              <StateBlock title={t("analytics.noData")} />
            ) : (
              <SegmentBar
                locale={locale}
                items={data.channels.map((c) => ({
                  label: channelName(c.label),
                  value: c.count,
                  colorVar: CHANNEL_COLORS[c.label] ?? "--chart-3",
                }))}
              />
            )}
            <div className="viz-subhead">{t("analytics.efficiency")}</div>
            <dl className="mini-stats">
              <div>
                <dt>{t("analytics.cacheHitRate")}</dt>
                <dd>{formatPercent(data.cache_hit_rate, locale)}</dd>
              </div>
              <div>
                <dt>{t("analytics.tokenUsage")}</dt>
                <dd>{formatNumber(data.prompt_tokens + data.completion_tokens, locale)}</dd>
              </div>
              <div>
                <dt>{t("analytics.staleDocuments")}</dt>
                <dd>{formatNumber(data.stale_documents, locale)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card className="viz-span-2">
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
      </div>
    </>
  );
}

function Body({ projectId, t, locale }: { projectId: string; t: TranslateFn; locale: Locale }) {
  const { api } = useAuth();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const { data, loading, error } = useAsyncData(() => api.analytics.get(projectId, days, false), [projectId, days]);

  return (
    <div className="stack">
      <div className="filter-row" role="radiogroup" aria-label={t("analytics.range")}>
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={days === r}
            className={days === r ? "filter-chip is-on" : "filter-chip"}
            onClick={() => setDays(r)}
          >
            {t(`analytics.range${r}`)}
          </button>
        ))}
      </div>

      {error ? (
        <StateBlock title={t("common.loadFailed")} text={errorMessage(t, error)} />
      ) : !data ? (
        loading ? <LoadingBlock label={t("common.loading")} /> : <StateBlock title={t("analytics.noData")} />
      ) : (
        // Refetch keeps the frame: the previous render dims instead of flashing a skeleton.
        <div className={loading ? "viz-frame is-refreshing" : "viz-frame"}>
          <Report data={data} t={t} locale={locale} />
        </div>
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
