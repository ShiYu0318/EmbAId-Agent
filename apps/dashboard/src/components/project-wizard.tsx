"use client";

import { useState } from "react";

import { Button, Dialog, Field, InlineError, Input } from "@/components/ui";
import { errorMessage } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useProjects } from "@/lib/project-context";

export function ProjectWizard({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const { t } = useI18n();
  const { create } = useProjects();

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persona templates are applied in Widget Studio after project creation.
  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await create({ name: name.trim() });
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

      {error && <InlineError>{error}</InlineError>}
    </Dialog>
  );
}
