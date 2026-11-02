"use client";

import Link from "next/link";

import { IconArrowRight, IconCheck } from "@/components/icons";
import { Card, CardBody, CardHeader } from "@/components/ui";
import type { Analytics } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/context";
import { formatPercent } from "@/lib/format";
import { useAsyncData } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useLaunchStatus } from "@/lib/launch";

type Tone = "warning" | "info" | "danger";

interface Action {
  key: string;
  tone: Tone;
  title: string;
  text: string;
  href: string;
  cta: string;
}

const REFUSAL_ALERT = 0.2;
const REFUSAL_MIN_ANSWERS = 10;
const MAX_ACTIONS = 4;

function ToneIcon({ tone }: { tone: Tone }) {
  // Shape carries the state alongside color: triangle = attention, circle-i = info, octagon = risk.
  if (tone === "warning")
    return (
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
        <path d="M10 2.5 18 17H2Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M10 8v4M10 14.2v.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (tone === "danger")
    return (
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
        <path d="M7 2.5h6L17.5 7v6L13 17.5H7L2.5 13V7Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M10 6.5v4.5M10 13.4v.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 9v5M10 6.2v.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Turns the numbers on the overview into the next concrete thing to do. */
export function NextActions({ projectId, analytics }: { projectId: string; analytics: Analytics }) {
  const { t, locale } = useI18n();
  const { api } = useAuth();
  const launch = useLaunchStatus(projectId).data;
  const gaps = useAsyncData(async () => {
    const [open, drafts] = await Promise.all([
      api.knowledgeGaps.list(projectId, "open"),
      api.knowledgeGaps.list(projectId, "draft_ready"),
    ]);
    return { open: open.length, drafts: drafts.length };
  }, [projectId]).data;

  const actions: Action[] = [];
  if (gaps && gaps.open > 0)
    actions.push({ key: "gaps", tone: "warning", title: t("actions.gapsTitle", { n: gaps.open }), text: t("actions.gapsText"), href: "/knowledge-gaps", cta: t("actions.gapsCta") });
  if (gaps && gaps.drafts > 0)
    actions.push({ key: "drafts", tone: "info", title: t("actions.draftsTitle", { n: gaps.drafts }), text: t("actions.draftsText"), href: "/knowledge-gaps", cta: t("actions.draftsCta") });
  if (analytics.answers >= REFUSAL_MIN_ANSWERS && analytics.refusal_rate > REFUSAL_ALERT)
    actions.push({ key: "refusals", tone: "warning", title: t("actions.refusalTitle", { rate: formatPercent(analytics.refusal_rate, locale) }), text: t("actions.refusalText"), href: "/knowledge", cta: t("actions.refusalCta") });
  if (analytics.stale_documents > 0)
    actions.push({ key: "stale", tone: "info", title: t("actions.staleTitle", { n: analytics.stale_documents }), text: t("actions.staleText"), href: "/knowledge", cta: t("actions.staleCta") });
  if (launch?.hasKey && !launch.hasOrigins)
    actions.push({ key: "origins", tone: "danger", title: t("actions.originsTitle"), text: t("actions.originsText"), href: "/embed", cta: t("actions.originsCta") });
  if (launch?.hasKey && !launch.live)
    actions.push({ key: "live", tone: "info", title: t("actions.liveTitle"), text: t("actions.liveText"), href: "/embed#verify", cta: t("actions.liveCta") });

  if (!gaps || !launch) return null;
  const shown = actions.slice(0, MAX_ACTIONS);

  return (
    <Card className="next-actions">
      <CardHeader title={t("actions.title")} subtitle={shown.length ? t("actions.subtitle", { n: actions.length }) : undefined} />
      <CardBody>
        {shown.length === 0 ? (
          <div className="next-actions__clear">
            <span aria-hidden>
              <IconCheck size={16} />
            </span>
            {t("actions.allClear")}
          </div>
        ) : (
          <ul className="next-actions__list">
            {shown.map((a, i) => (
              <li key={a.key} data-tone={a.tone} style={{ animationDelay: `${i * 60}ms` }}>
                <span className="next-actions__icon">
                  <ToneIcon tone={a.tone} />
                  <span className="sr-only">{t(`actions.tone_${a.tone}`)}</span>
                </span>
                <div className="next-actions__copy">
                  <strong>{a.title}</strong>
                  <span>{a.text}</span>
                </div>
                <Link href={a.href} className="next-actions__cta">
                  {a.cta}
                  <IconArrowRight size={14} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
