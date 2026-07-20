"use client";

import type { ReactNode } from "react";

import { StateBlock } from "@/components/ui";
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
    return <StateBlock title={t("project.noProjects")} text={t("project.noProjectsHint")} />;
  }
  return <>{children(current.id)}</>;
}
