"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { IconArrowRight } from "@/components/icons";
import { PageHeader, RequireProject } from "@/components/page";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  Field,
  InlineSuccess,
  Input,
  LoadingBlock,
  Select,
  StateBlock,
  Textarea,
} from "@/components/ui";
import { useAuth } from "@/lib/auth/context";
import type { ProjectTemplate, WidgetConfig } from "@/lib/api/types";
import { errorMessage, useAsyncData } from "@/lib/hooks";
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
  const router = useRouter();
  const { data, loading, error } = useAsyncData(
    () => api.projects.getWidgetConfig(projectId),
    [projectId],
  );
  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [templateKey, setTemplateKey] = useState("");
  // Template picked from the selector, held until the overwrite dialog is confirmed.
  const [pendingTemplate, setPendingTemplate] = useState<ProjectTemplate | null>(null);
  // system_prompt from an applied template, PATCHed onto the project when saved.
  const [appliedSystemPrompt, setAppliedSystemPrompt] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setConfig({ ...DEFAULT_CONFIG, ...data });
  }, [data]);

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

  if (loading) return <LoadingBlock label={t("common.loading")} />;
  if (error) return <StateBlock title={t("common.loadFailed")} text={errorMessage(t, error)} />;

  function set<K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function onTemplatePick(key: string) {
    if (!key) {
      setTemplateKey("");
      return;
    }
    // Confirm before overwriting — the Select value only moves on confirm, so a
    // cancelled dialog leaves the dropdown on its previous selection.
    const tpl = templates.find((item) => item.key === key);
    if (tpl) setPendingTemplate(tpl);
  }

  function applyTemplate(tpl: ProjectTemplate) {
    // Full overwrite of the appearance fields the template controls (§4 decision).
    setConfig((prev) => ({
      ...prev,
      bot_name: tpl.bot_name,
      greeting: tpl.greeting,
      persona: tpl.persona,
      suggested_questions: [...tpl.suggested_questions],
    }));
    setAppliedSystemPrompt(tpl.system_prompt);
    setTemplateKey(tpl.key);
    setSaved(false);
    setPendingTemplate(null);
  }

  async function save() {
    setBusy(true);
    try {
      await api.projects.putWidgetConfig(projectId, {
        ...config,
        suggested_questions: config.suggested_questions.map((q) => q.trim()).filter(Boolean),
      });
      // Applying a template also updates the project's system prompt on save.
      if (appliedSystemPrompt !== null) {
        await api.projects.update(projectId, { system_prompt: appliedSystemPrompt });
        setAppliedSystemPrompt(null);
      }
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  const botName = config.bot_name || t("common.appName");
  const greeting = config.greeting || t("widget.previewGreetingFallback");
  const chips = config.suggested_questions.map((q) => q.trim()).filter(Boolean);
  const avatarStyle = config.bot_avatar_url
    ? {
        backgroundImage: `url("${config.bot_avatar_url}")`,
        backgroundSize: "cover" as const,
        backgroundPosition: "center" as const,
      }
    : undefined;

  return (
    <div className="widget-studio">
      <Card>
        <CardHeader title={t("widget.appearance")} />
        <CardBody>
          <Field label={t("project.template")} hint={t("widget.templateHint")}>
            <Select value={templateKey} onChange={(e) => onTemplatePick(e.target.value)}>
              <option value="">{t("project.noTemplate")}</option>
              {templates.map((tpl) => (
                <option key={tpl.key} value={tpl.key}>
                  {tpl.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t("widget.botName")}>
            <Input
              value={config.bot_name}
              placeholder={t("widget.botNamePlaceholder")}
              onChange={(e) => set("bot_name", e.target.value)}
            />
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
          <Field label={t("widget.suggestedQuestions")}>
            <div className="question-editor">
              {config.suggested_questions.map((q, i) => (
                <div key={i} className="question-row">
                  <Input
                    value={q}
                    placeholder={t("widget.questionPlaceholder")}
                    onChange={(e) =>
                      set(
                        "suggested_questions",
                        config.suggested_questions.map((item, j) => (j === i ? e.target.value : item)),
                      )
                    }
                  />
                  <Button
                    size="sm"
                    onClick={() =>
                      set(
                        "suggested_questions",
                        config.suggested_questions.filter((_, j) => j !== i),
                      )
                    }
                  >
                    {t("common.remove")}
                  </Button>
                </div>
              ))}
              {config.suggested_questions.length < 6 && (
                <Button size="sm" onClick={() => set("suggested_questions", [...config.suggested_questions, ""])}>
                  {t("widget.addQuestion")}
                </Button>
              )}
            </div>
          </Field>

          {saved && <InlineSuccess>{t("widget.savedConfig")}</InlineSuccess>}
          <div className="row-actions">
            <Button variant="primary" loading={busy} onClick={() => void save()}>
              {t("widget.saveConfig")}
            </Button>
            {saved && (
              // TODO: point at the dedicated embed-settings page once it ships (§5);
              // for now the API keys + embed snippet live under /settings.
              <Button variant="secondary" onClick={() => router.push("/settings")}>
                {t("widget.goToEmbed")}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("widget.preview")} />
        <CardBody>
          <div className="widget-chat">
            <div className="widget-chat__header" style={{ background: config.accent_color }}>
              <span className="widget-chat__avatar" style={avatarStyle}>
                {config.bot_avatar_url ? null : botName.slice(0, 1).toUpperCase()}
              </span>
              <span className="widget-chat__name">{botName}</span>
            </div>

            <div className="widget-chat__log">
              <div className="widget-chat__bubble">{greeting}</div>
            </div>

            <div className="widget-chat__footer">
              {chips.length > 0 && (
                <div className="widget-chat__starters">
                  {chips.map((q, i) => (
                    <span key={i} className="widget-chat__starter">
                      {q}
                    </span>
                  ))}
                </div>
              )}
              <div className="widget-chat__composer">
                <input
                  className="widget-chat__input"
                  placeholder={t("widget.previewInputPlaceholder")}
                  disabled
                  aria-hidden
                />
                <span
                  className="widget-chat__send"
                  style={{ background: config.accent_color }}
                  aria-hidden
                >
                  <IconArrowRight size={18} />
                </span>
              </div>
            </div>

            <div className="widget-chat__branding">
              {t("widget.poweredBy")} <strong>proprAI</strong>
            </div>
          </div>
        </CardBody>
      </Card>

      {pendingTemplate && (
        <Dialog
          title={t("widget.templateOverwriteTitle")}
          onClose={() => setPendingTemplate(null)}
          closeLabel={t("common.close")}
          footer={
            <>
              <Button onClick={() => setPendingTemplate(null)}>{t("common.cancel")}</Button>
              <Button variant="primary" onClick={() => applyTemplate(pendingTemplate)}>
                {t("widget.templateOverwriteCta")}
              </Button>
            </>
          }
        >
          <p className="muted">{t("widget.templateOverwriteConfirm")}</p>
        </Dialog>
      )}
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
