"use client";

import { useState } from "react";

import { PageHeader, RequireProject } from "@/components/page";
import {
  Badge,
  Button,
  Card,
  CardBody,
  InlineSuccess,
  LoadingBlock,
  StateBlock,
  Textarea,
} from "@/components/ui";
import { useAuth } from "@/lib/auth/context";
import type { KnowledgeGap } from "@/lib/api/types";
import { errorMessage, useAsyncData } from "@/lib/hooks";
import { useI18n, type TranslateFn } from "@/lib/i18n";

function GapCard({ gap, t, onChange }: { gap: KnowledgeGap; t: TranslateFn; onChange: () => void }) {
  const { api } = useAuth();
  const [answer, setAnswer] = useState(gap.draft_answer ?? "");
  const [busy, setBusy] = useState<"draft" | "approve" | null>(null);
  const [done, setDone] = useState(false);

  async function draft() {
    setBusy("draft");
    try {
      const result = await api.knowledgeGaps.draft(gap.id);
      setAnswer(result.draft_answer);
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    setBusy("approve");
    try {
      await api.knowledgeGaps.approve(gap.id, { answer });
      setDone(true);
      onChange();
    } finally {
      setBusy(null);
    }
  }

  const tone =
    gap.status === "resolved" ? "success" : gap.status === "draft_ready" ? "accent" : "neutral";

  return (
    <Card>
      <CardBody>
        <div className="gap-head">
          <div>
            <div className="gap-question">{gap.question_text}</div>
            <div className="muted">{t("knowledgeGaps.occurrences", { count: gap.occurrence_count })}</div>
          </div>
          <Badge tone={tone}>{t(`knowledgeGaps.status${statusKey(gap.status)}`)}</Badge>
        </div>

        {done ? (
          <InlineSuccess>{t("knowledgeGaps.approvedNote")}</InlineSuccess>
        ) : (
          <>
            <Textarea
              rows={4}
              value={answer}
              placeholder={t("knowledgeGaps.answerPlaceholder")}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <div className="row-actions">
              <Button loading={busy === "draft"} onClick={() => void draft()}>
                {answer ? t("knowledgeGaps.regenerate") : t("knowledgeGaps.generateDraft")}
              </Button>
              <Button
                variant="primary"
                disabled={!answer.trim()}
                loading={busy === "approve"}
                onClick={() => void approve()}
              >
                {t("knowledgeGaps.approve")}
              </Button>
              <Button onClick={() => void api.knowledgeGaps.dismiss(gap.id).then(onChange)}>
                {t("knowledgeGaps.dismiss")}
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function statusKey(status: string): string {
  if (status === "draft_ready") return "DraftReady";
  if (status === "resolved") return "Resolved";
  return "Open";
}

function Gaps({ projectId, t }: { projectId: string; t: TranslateFn }) {
  const { api } = useAuth();
  const { data, loading, error, reload } = useAsyncData(
    () => api.knowledgeGaps.list(projectId),
    [projectId],
  );

  if (loading) return <LoadingBlock label={t("common.loading")} />;
  if (error) return <StateBlock title={t("common.loadFailed")} text={errorMessage(t, error)} />;
  if (!data || data.length === 0) return <StateBlock title={t("knowledgeGaps.noGaps")} />;

  return (
    <div className="stack">
      {data.map((gap) => (
        <GapCard key={gap.id} gap={gap} t={t} onChange={reload} />
      ))}
    </div>
  );
}

export default function KnowledgeGapsPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t("knowledgeGaps.title")} subtitle={t("knowledgeGaps.subtitle")} />
      <RequireProject>{(projectId) => <Gaps projectId={projectId} t={t} />}</RequireProject>
    </>
  );
}
