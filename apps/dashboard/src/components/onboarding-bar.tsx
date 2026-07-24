"use client";

import Link from "next/link";
import { useState } from "react";

import { IconArrowRight, IconCheck, IconChevronDown } from "@/components/icons";
import { useAuth } from "@/lib/auth/context";
import { useAsyncData } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

interface BarStep {
  title: string;
  cta: string;
  href: string;
  done: boolean;
}

export function OnboardingBar({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const { api } = useAuth();
  const [expanded, setExpanded] = useState(false);

  const { data } = useAsyncData(async () => {
    const [documents, config, keys] = await Promise.all([
      api.documents.list(projectId, { limit: 1 }),
      api.projects.getWidgetConfig(projectId),
      api.apiKeys.list(projectId),
    ]);
    return {
      hasDocuments: documents.length > 0,
      customized: Boolean(config.greeting || config.bot_name || config.suggested_questions.length),
      hasPublishableKey: keys.some((k) => k.type === "publishable" && !k.revoked_at),
    };
  }, [projectId]);

  if (!data) return null;

  const steps: BarStep[] = [
    {
      title: t("onboarding.stepKnowledge"),
      cta: t("onboarding.ctaKnowledge"),
      href: "/knowledge",
      done: data.hasDocuments,
    },
    {
      title: t("onboarding.stepCustomize"),
      cta: t("onboarding.ctaCustomize"),
      href: "/widget",
      done: data.customized,
    },
    {
      title: t("onboarding.stepEmbed"),
      cta: t("onboarding.ctaEmbed"),
      href: "/settings",
      done: data.hasPublishableKey,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  if (allDone && !expanded) {
    return (
      <button type="button" className="onboard-bar__live" onClick={() => setExpanded(true)}>
        <span className="onboard-bar__live-mark" aria-hidden>
          <IconCheck size={13} />
        </span>
        <span className="onboard-bar__live-text">{t("onboarding.liveExpand")}</span>
        <IconChevronDown size={15} className="onboard-bar__live-caret" aria-hidden />
      </button>
    );
  }

  // Fill the rail up to the last completed step. Steps unlock sequentially, so the
  // completed steps are always a prefix (0..doneCount-1). The rail spans from the first
  // marker centre to the last, i.e. (n-1)/n of the track width.
  const fill = steps.length > 1 ? Math.max(0, doneCount - 1) / (steps.length - 1) : doneCount > 0 ? 1 : 0;
  const railSpanPct = ((steps.length - 1) / steps.length) * 100;

  return (
    <section className="onboard-bar" aria-label={t("onboarding.title")}>
      <div className="onboard-bar__head">
        <span className="onboard-bar__title">{t("onboarding.title")}</span>
        <span className="onboard-bar__count">
          {doneCount} / {steps.length}
        </span>
        {allDone ? (
          <button
            type="button"
            className="onboard-bar__collapse"
            onClick={() => setExpanded(false)}
            aria-label={t("onboarding.collapse")}
            title={t("onboarding.collapse")}
          >
            <IconChevronDown size={16} />
          </button>
        ) : null}
      </div>

      <ol className="onboard-bar__track">
        <span className="onboard-bar__rail" aria-hidden />
        <span className="onboard-bar__rail-fill" style={{ width: `${fill * railSpanPct}%` }} aria-hidden />
        {steps.map((step, i) => {
          const unlocked = i === 0 || steps[i - 1].done;
          const state = step.done ? "is-done" : unlocked ? "is-active" : "is-locked";
          return (
            <li key={step.href} className={`onboard-node ${state}`}>
              <span className="onboard-node__marker">
                {step.done ? <IconCheck size={15} /> : i + 1}
              </span>
              <span className="onboard-node__title">{step.title}</span>
              {step.done ? (
                <span className="onboard-node__status">{t("onboarding.done")}</span>
              ) : unlocked ? (
                <Link href={step.href} className="onboard-node__cta">
                  {step.cta}
                  <IconArrowRight size={14} />
                </Link>
              ) : (
                <span
                  className="onboard-node__cta is-locked"
                  aria-disabled="true"
                  title={t("onboarding.locked")}
                >
                  {step.cta}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
