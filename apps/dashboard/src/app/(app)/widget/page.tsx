"use client";

import { useEffect, useState } from "react";

import { PageHeader, RequireProject } from "@/components/page";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  InlineSuccess,
  Input,
  LoadingBlock,
  StateBlock,
  Textarea,
} from "@/components/ui";
import { useAuth } from "@/lib/auth/context";
import { apiBaseUrl } from "@/lib/api/config";
import type { WidgetConfig } from "@/lib/api/types";
import { errorMessage, useAsyncData, useCopy } from "@/lib/hooks";
import { useI18n, type TranslateFn } from "@/lib/i18n";

const DEFAULT_CONFIG: WidgetConfig = {
  greeting: "",
  suggested_questions: [],
  bot_name: "",
  bot_avatar_url: null,
  persona: "",
  accent_color: "#2f6df6",
};

function Studio({ projectId, t }: { projectId: string; t: TranslateFn }) {
  const { api } = useAuth();
  const { data, loading, error } = useAsyncData(
    () => api.projects.getWidgetConfig(projectId),
    [projectId],
  );
  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, copy] = useCopy();

  useEffect(() => {
    if (data) setConfig({ ...DEFAULT_CONFIG, ...data });
  }, [data]);

  if (loading) return <LoadingBlock label={t("common.loading")} />;
  if (error) return <StateBlock title={t("common.loadFailed")} text={errorMessage(t, error)} />;

  function set<K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    try {
      await api.projects.putWidgetConfig(projectId, config);
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  const snippet = `<script src="${apiBaseUrl()}/widget.js" data-key="YOUR_PUBLISHABLE_KEY" data-project="${projectId}"></script>`;

  return (
    <div className="widget-studio">
      <Card>
        <CardHeader title={t("widget.appearance")} />
        <CardBody>
          <Field label={t("widget.botName")}>
            <Input value={config.bot_name} onChange={(e) => set("bot_name", e.target.value)} />
          </Field>
          <Field label={t("widget.greeting")}>
            <Textarea
              rows={2}
              value={config.greeting}
              placeholder={t("widget.greetingPlaceholder")}
              onChange={(e) => set("greeting", e.target.value)}
            />
          </Field>
          <Field label={t("widget.persona")}>
            <Textarea
              rows={2}
              value={config.persona}
              placeholder={t("widget.personaPlaceholder")}
              onChange={(e) => set("persona", e.target.value)}
            />
          </Field>
          <Field label={t("widget.accentColor")}>
            <Input
              type="color"
              value={config.accent_color}
              onChange={(e) => set("accent_color", e.target.value)}
            />
          </Field>
          <Field label={t("widget.avatarUrl")}>
            <Input
              value={config.bot_avatar_url ?? ""}
              placeholder={t("widget.avatarPlaceholder")}
              onChange={(e) => set("bot_avatar_url", e.target.value || null)}
            />
          </Field>
          {saved && <InlineSuccess>{t("widget.savedConfig")}</InlineSuccess>}
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {t("widget.saveConfig")}
          </Button>
        </CardBody>
      </Card>

      <div className="stack">
        <Card>
          <CardHeader title={t("widget.preview")} />
          <CardBody>
            <div className="widget-preview" style={{ borderColor: config.accent_color }}>
              <div className="widget-preview-header" style={{ background: config.accent_color }}>
                {config.bot_name || t("common.appName")}
              </div>
              <div className="widget-preview-body">
                {config.greeting || t("widget.previewGreetingFallback")}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("widget.embed")} />
          <CardBody>
            <p className="muted">{t("widget.embedHint")}</p>
            <pre className="code-block">{snippet}</pre>
            <Button onClick={() => copy(snippet)}>
              {copied ? t("common.copied") : t("widget.copySnippet")}
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default function WidgetPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t("widget.title")} subtitle={t("widget.subtitle")} />
      <RequireProject>{(projectId) => <Studio projectId={projectId} t={t} />}</RequireProject>
    </>
  );
}
