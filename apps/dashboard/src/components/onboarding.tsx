"use client";

import Link from "next/link";

import { Button, Card, CardBody, CardHeader } from "@/components/ui";
import { useAuth } from "@/lib/auth/context";
import { useAsyncData } from "@/lib/hooks";
import { type TranslateFn } from "@/lib/i18n";

interface Step {
  title: string;
  text: string;
  done: boolean;
  href?: string;
  cta?: string;
}

export function Onboarding({ projectId, t }: { projectId: string; t: TranslateFn }) {
  const { api } = useAuth();
  const { data } = useAsyncData(
    async () => {
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
    },
    [projectId],
  );

  if (!data) return null;

  const steps: Step[] = [
    { title: t("onboarding.step1Title"), text: t("onboarding.step1Text"), done: true },
    {
      title: t("onboarding.step2Title"),
      text: t("onboarding.step2Text"),
      done: data.hasDocuments,
      href: "/knowledge",
      cta: t("onboarding.step2Cta"),
    },
    {
      title: t("onboarding.step3Title"),
      text: t("onboarding.step3Text"),
      done: data.customized,
      href: "/widget",
      cta: t("onboarding.step3Cta"),
    },
    {
      title: t("onboarding.step4Title"),
      text: t("onboarding.step4Text"),
      done: data.hasPublishableKey,
      href: "/widget",
      cta: t("onboarding.step4Cta"),
    },
  ];

  const allDone = steps.every((s) => s.done);
  if (allDone) {
    return (
      <Card>
        <CardBody>
          <div className="onboard-done">
            <span className="onboard-done__mark">✓</span>
            <div>
              <div className="onboard-done__title">{t("onboarding.allDoneTitle")}</div>
              <div className="onboard-done__text">{t("onboarding.allDoneText")}</div>
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }

  const completed = steps.filter((s) => s.done).length;

  return (
    <Card>
      <CardHeader title={t("onboarding.title")} subtitle={`${completed} / ${steps.length} · ${t("onboarding.subtitle")}`} />
      <CardBody>
        <ol className="onboard-steps">
          {steps.map((step, i) => (
            <li key={i} className={step.done ? "onboard-step done" : "onboard-step"}>
              <span className="onboard-step__marker">{step.done ? "✓" : i + 1}</span>
              <div className="onboard-step__body">
                <div className="onboard-step__head">
                  <span className="onboard-step__title">{step.title}</span>
                  <span className="onboard-step__status">
                    {step.done ? t("onboarding.done") : t("onboarding.todo")}
                  </span>
                </div>
                <div className="onboard-step__text">{step.text}</div>
                {!step.done && step.href && step.cta ? (
                  <Link href={step.href} className="onboard-step__cta">
                    <Button size="sm" variant="primary">
                      {step.cta}
                    </Button>
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}
