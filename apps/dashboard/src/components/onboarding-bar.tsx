"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { IconArrowRight, IconCheck, IconChevronDown } from "@/components/icons";
import { useI18n } from "@/lib/i18n";
import { useLaunchStatus } from "@/lib/launch";

interface LaunchStep {
  title: string;
  cta: string;
  href: string;
  done: boolean;
}

export function OnboardingBar({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const { data, reload } = useLaunchStatus(projectId);
  const [open, setOpen] = useState<boolean | null>(null);
  // The bar lives in the app shell, so re-read progress whenever the user moves on.
  const pathname = usePathname();
  useEffect(() => reload(), [pathname, reload]);

  if (!data) return null;

  const steps: LaunchStep[] = [
    { title: t("onboarding.stepKnowledge"), cta: t("onboarding.ctaKnowledge"), href: "/knowledge", done: data.hasDocuments },
    { title: t("onboarding.stepIndexed"), cta: t("onboarding.ctaIndexed"), href: "/knowledge", done: data.indexed },
    { title: t("onboarding.stepTest"), cta: t("onboarding.ctaTest"), href: "/playground", done: data.tested },
    { title: t("onboarding.stepCustomize"), cta: t("onboarding.ctaCustomize"), href: "/widget", done: data.customized },
    { title: t("onboarding.stepEmbed"), cta: t("onboarding.ctaEmbed"), href: "/embed", done: data.hasKey && data.hasOrigins },
    { title: t("onboarding.stepLive"), cta: t("onboarding.ctaLive"), href: "/embed#verify", done: data.live },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  // New projects see every step; once most of the work is done the bar stays compact.
  const expanded = open ?? doneCount < 2;

  return (
    <section className="launch" aria-label={t("onboarding.title")}>
      <div className="launch__head">
        <div className="launch__summary">
          <span className="launch__title">{t("onboarding.title")}</span>
          <span className="launch__count">
            {doneCount}/{steps.length}
          </span>
        </div>

        <div
          className="launch__meter"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={doneCount}
          aria-label={t("onboarding.title")}
        >
          {steps.map((s) => (
            <span key={s.title} data-done={s.done || undefined} title={s.title} />
          ))}
        </div>

        {next ? (
          <Link href={next.href} className="launch__next">
            <span>{t("onboarding.next")}</span>
            <b>{next.title}</b>
            <IconArrowRight size={14} />
          </Link>
        ) : (
          <span className="launch__done">
            <IconCheck size={14} />
            {t("onboarding.allDone")}
          </span>
        )}

        <button type="button" className="launch__toggle" aria-expanded={expanded} onClick={() => setOpen(!expanded)}>
          {expanded ? t("onboarding.collapse") : t("onboarding.showAll")}
          <IconChevronDown size={14} />
        </button>
      </div>

      {expanded ? (
        <ol className="launch__steps">
          {steps.map((step, i) => (
            <li key={step.title} data-done={step.done || undefined} data-next={step === next || undefined}>
              <span className="launch__mark" aria-hidden>
                {step.done ? <IconCheck size={13} /> : i + 1}
              </span>
              <div className="launch__step">
                <b>{step.title}</b>
                {step.done ? <small>{t("onboarding.done")}</small> : <Link href={step.href}>{step.cta}</Link>}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
