"use client";

import { useEffect, useState } from "react";

import { Button, Dialog, Field, InlineError, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth/context";
import type { ProjectTemplate } from "@/lib/api/types";
import { errorMessage } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useProjects } from "@/lib/project-context";

export function ProjectWizard({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const { t } = useI18n();
  const { api } = useAuth();
  const { create } = useProjects();

  const [name, setName] = useState("");
  const [template, setTemplate] = useState<string>("");
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.projects
      .templates()
      .then((list) => {
        if (active) setTemplates(list);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api]);

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await create({ name: name.trim(), template: template || null });
      onCreated?.();
      onClose();
    } catch (err) {
      setError(errorMessage(t, err));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={t("project.newProject")}
      onClose={onClose}
      closeLabel={t("common.close")}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => void submit()}>
            {t("project.createCta")}
          </Button>
        </>
      }
    >
      <Field label={t("project.projectName")}>
        <Input
          autoFocus
          value={name}
          placeholder={t("project.projectNamePlaceholder")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
      </Field>

      <Field label={t("project.template")}>
        <div className="template-grid">
          <button
            type="button"
            className={template === "" ? "template-card active" : "template-card"}
            onClick={() => setTemplate("")}
          >
            <span className="template-card__name">{t("project.noTemplate")}</span>
          </button>
          {templates.map((tpl) => (
            <button
              key={tpl.key}
              type="button"
              className={template === tpl.key ? "template-card active" : "template-card"}
              onClick={() => setTemplate(tpl.key)}
            >
              <span className="template-card__name">{tpl.name}</span>
              <span className="template-card__desc">{tpl.description}</span>
            </button>
          ))}
        </div>
      </Field>

      {error && <InlineError>{error}</InlineError>}
    </Dialog>
  );
}
