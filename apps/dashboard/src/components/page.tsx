"use client";

import type { ReactNode } from "react";

import { Button, StateBlock } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useProjects } from "@/lib/project-context";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function RequireProject({ children }: { children: (projectId: string) => ReactNode }) {
  const { t } = useI18n();
  const { current, loading } = useProjects();

  if (loading) {
    return <StateBlock title={t("common.loading")} />;
  }
  if (!current) {
    return <FirstRun />;
  }
  return <>{children(current.id)}</>;
}

/** Opens the project wizard owned by the app shell. */
export const NEW_PROJECT_EVENT = "embaid:new-project";

const FIRST_RUN_STEPS = [
  "onboarding.stepKnowledge",
  "onboarding.stepIndexed",
  "onboarding.stepTest",
  "onboarding.stepCustomize",
  "onboarding.stepEmbed",
  "onboarding.stepLive",
];

function FirstRun() {
  const { t } = useI18n();
  return (
    <section className="first-run">
      <span className="first-run__eyebrow">{t("project.firstRunEyebrow")}</span>
      <h2 className="first-run__title">{t("project.firstRunTitle")}</h2>
      <p className="first-run__text">{t("project.noProjectsHint")}</p>
      <Button variant="primary" size="lg" onClick={() => window.dispatchEvent(new Event(NEW_PROJECT_EVENT))}>
        {t("project.createFirst")}
      </Button>
      <ol className="first-run__steps">
        {FIRST_RUN_STEPS.map((key, i) => (
          <li key={key} style={{ animationDelay: `${120 + i * 50}ms` }}>
            <span>{i + 1}</span>
            {t(key)}
          </li>
        ))}
      </ol>
    </section>
  );
}
