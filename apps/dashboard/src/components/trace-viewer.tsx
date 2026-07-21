"use client";

import { Badge, Card, CardBody, CardHeader } from "@/components/ui";
import type { FusedHit, RerankedHit, RetrievalTrace, VectorHit } from "@/lib/api/types";
import { useI18n, type TranslateFn } from "@/lib/i18n";

function Score({ value }: { value: number | null }) {
  return <span className="trace-score">{value === null ? "—" : value.toFixed(3)}</span>;
}

function HitRows({ hits, t }: { hits: VectorHit[]; t: TranslateFn }) {
  if (hits.length === 0) return <p className="muted">{t("trace.noHits")}</p>;
  return (
    <table className="data-table compact">
      <thead>
        <tr>
          <th>{t("trace.rank")}</th>
          <th>{t("trace.chunk")}</th>
          <th>{t("trace.score")}</th>
        </tr>
      </thead>
      <tbody>
        {hits.map((hit) => (
          <tr key={hit.chunk_id}>
            <td>{hit.rank + 1}</td>
            <td>
              <code>{hit.chunk_id}</code>
            </td>
            <td>
              <Score value={hit.score} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FusedRows({ hits, t }: { hits: FusedHit[]; t: TranslateFn }) {
  if (hits.length === 0) return <p className="muted">{t("trace.noHits")}</p>;
  return (
    <table className="data-table compact">
      <thead>
        <tr>
          <th>{t("trace.chunk")}</th>
          <th>{t("trace.rrfScore")}</th>
          <th>{t("trace.vectorRank")}</th>
          <th>{t("trace.lexicalRank")}</th>
          <th>{t("trace.trustScore")}</th>
        </tr>
      </thead>
      <tbody>
        {hits.map((hit) => (
          <tr key={hit.chunk_id}>
            <td>
              <code>{hit.chunk_id}</code>
              {hit.is_stale ? <Badge tone="warning">{t("trace.staleFlag")}</Badge> : null}
            </td>
            <td>
              <Score value={hit.rrf_score} />
            </td>
            <td>{hit.vector_rank === null ? "—" : hit.vector_rank + 1}</td>
            <td>{hit.lexical_rank === null ? "—" : hit.lexical_rank + 1}</td>
            <td>{hit.trust_score.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RerankRows({ hits, t }: { hits: RerankedHit[]; t: TranslateFn }) {
  if (hits.length === 0) return <p className="muted">{t("trace.noHits")}</p>;
  return (
    <table className="data-table compact">
      <thead>
        <tr>
          <th>{t("trace.rank")}</th>
          <th>{t("trace.chunk")}</th>
          <th>{t("trace.rerankScore")}</th>
        </tr>
      </thead>
      <tbody>
        {hits.map((hit, index) => (
          <tr key={hit.chunk_id}>
            <td>{index + 1}</td>
            <td>
              <code>{hit.chunk_id}</code>
            </td>
            <td>
              <Score value={hit.rerank_score} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TraceViewer({ trace }: { trace: RetrievalTrace }) {
  const { t } = useI18n();

  const aboveThreshold =
    trace.confidence_score !== null &&
    trace.confidence_threshold !== null &&
    trace.confidence_score >= trace.confidence_threshold;

  return (
    <div className="trace-viewer">
      <Card>
        <CardHeader title={t("trace.query")} />
        <CardBody>
          <dl className="trace-defs">
            <dt>{t("trace.originalQuery")}</dt>
            <dd>{trace.original_query}</dd>
            <dt>{t("trace.rewrittenQuery")}</dt>
            <dd>{trace.rewritten_query ?? t("trace.noRewrite")}</dd>
            <dt>{t("trace.cache")}</dt>
            <dd>
              {trace.cache_hit ? (
                <Badge tone="accent">{t("trace.cacheHit")}</Badge>
              ) : (
                <Badge tone="neutral">{t("trace.cacheMiss")}</Badge>
              )}
              {trace.cache_hit && trace.cache_similarity !== null
                ? ` ${t("trace.cacheSimilarity", { value: trace.cache_similarity.toFixed(3) })}`
                : null}
            </dd>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("trace.decision")} />
        <CardBody>
          <div className="trace-decision">
            <Badge tone={trace.answered ? "success" : "danger"}>
              {trace.answered ? t("trace.answered") : t("trace.refused")}
            </Badge>
            <span>
              {t("trace.confidence")}: <Score value={trace.confidence_score} />
            </span>
            <span>
              {t("trace.threshold")}: <Score value={trace.confidence_threshold} />
            </span>
            {trace.confidence_score !== null && trace.confidence_threshold !== null ? (
              <Badge tone={aboveThreshold ? "success" : "warning"}>
                {aboveThreshold ? t("trace.aboveThreshold") : t("trace.belowThreshold")}
              </Badge>
            ) : null}
          </div>
          {trace.refusal_reason ? (
            <p className="muted">
              {t("trace.refusalReason")}: {trace.refusal_reason}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="trace-columns">
        <Card>
          <CardHeader title={t("trace.vectorHits")} subtitle={t("trace.hitsCount", { count: trace.vector_hits.length })} />
          <CardBody>
            <HitRows hits={trace.vector_hits} t={t} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("trace.lexicalHits")} subtitle={t("trace.hitsCount", { count: trace.lexical_hits.length })} />
          <CardBody>
            <HitRows hits={trace.lexical_hits} t={t} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title={t("trace.fusedRanking")} />
        <CardBody>
          <FusedRows hits={trace.fused_hits} t={t} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("trace.rerankOrder")} />
        <CardBody>
          <RerankRows hits={trace.reranked_hits} t={t} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("trace.timings")} />
        <CardBody>
          <table className="data-table compact">
            <tbody>
              {Object.entries(trace.timings_ms).map(([stage, ms]) => (
                <tr key={stage}>
                  <td>{stage}</td>
                  <td>{t("trace.milliseconds", { value: ms.toFixed(1) })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
