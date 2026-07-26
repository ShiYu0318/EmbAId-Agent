"use client";

import { useState } from "react";

import { PageHeader, RequireProject } from "@/components/page";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  InlineNotice,
  InlineSuccess,
  Input,
  LoadingBlock,
  Select,
  StateBlock,
  Tabs,
} from "@/components/ui";
import { useAuth } from "@/lib/auth/context";
import type { ChatProvider, EmbeddingProvider, Project } from "@/lib/api/types";
import { errorMessage, useAsyncData } from "@/lib/hooks";
import { useI18n, type TranslateFn } from "@/lib/i18n";
import { useProjects } from "@/lib/project-context";

type Tab = "general" | "webhooks";

function General({ project, t }: { project: Project; t: TranslateFn }) {
  const { api } = useAuth();
  const { reload, remove } = useProjects();
  const [name, setName] = useState(project.name);
  const [chatProvider, setChatProvider] = useState<ChatProvider>(project.chat_provider);
  const [embeddingProvider, setEmbeddingProvider] = useState<EmbeddingProvider>(
    project.embedding_provider,
  );
  const [threshold, setThreshold] = useState(project.confidence_threshold);
  const [staleness, setStaleness] = useState(project.staleness_days);
  const [systemPrompt, setSystemPrompt] = useState(project.system_prompt ?? "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.projects.update(project.id, {
        name: name.trim() || project.name,
        chat_provider: chatProvider,
        embedding_provider: embeddingProvider,
        confidence_threshold: threshold,
        staleness_days: staleness,
        system_prompt: systemPrompt || null,
      });
      setSaved(true);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!window.confirm(t("project.deleteConfirm"))) return;
    setDeleting(true);
    try {
      await remove(project.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="stack">
    <Card>
      <CardHeader title={t("settings.general")} />
      <CardBody>
        <Field label={t("project.projectName")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("project.chatProvider")}>
          <Select value={chatProvider} onChange={(e) => setChatProvider(e.target.value as ChatProvider)}>
            <option value="anthropic">{t("project.providerAnthropic")}</option>
            <option value="openai">{t("project.providerOpenai")}</option>
            <option value="ollama">{t("project.providerOllama")}</option>
          </Select>
        </Field>
        <Field label={t("project.embeddingProvider")}>
          <Select
            value={embeddingProvider}
            onChange={(e) => setEmbeddingProvider(e.target.value as EmbeddingProvider)}
          >
            <option value="openai">{t("project.providerOpenai")}</option>
            <option value="ollama">{t("project.providerOllama")}</option>
          </Select>
        </Field>
        <Field label={t("project.confidenceThreshold")} hint={t("project.confidenceThresholdHint")}>
          <Input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </Field>
        <Field label={t("project.stalenessDays")} hint={t("project.stalenessDaysHint")}>
          <Input
            type="number"
            min="1"
            value={staleness}
            onChange={(e) => setStaleness(Number(e.target.value))}
          />
        </Field>
        <Field label={t("project.systemPrompt")}>
          <Input
            value={systemPrompt}
            placeholder={t("project.systemPromptPlaceholder")}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
        </Field>
        {saved && <InlineSuccess>{t("settings.generalSaved")}</InlineSuccess>}
        <Button variant="primary" loading={busy} onClick={() => void save()}>
          {t("common.save")}
        </Button>
      </CardBody>
    </Card>

    <Card>
      <CardHeader title={t("settings.dangerZone")} subtitle={t("project.deleteConfirm")} />
      <CardBody>
        <Button variant="dangerSolid" loading={deleting} onClick={() => void onDelete()}>
          {t("project.deleteProject")}
        </Button>
      </CardBody>
    </Card>
    </div>
  );
}

function Webhooks({ projectId, t }: { projectId: string; t: TranslateFn }) {
  const { api } = useAuth();
  const { data, loading, error, reload } = useAsyncData(() => api.webhooks.list(projectId), [projectId]);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function create() {
    setNotice(null);
    try {
      const created = await api.webhooks.create(projectId, {
        url,
        subscribed_events: ["document.indexed", "knowledge_gap.created"],
      });
      setSecret(created.secret);
      setUrl("");
      reload();
    } catch (err) {
      setNotice(errorMessage(t, err));
    }
  }

  return (
    <div className="stack">
      <Card>
        <CardHeader title={t("settings.addWebhook")} />
        <CardBody>
          <Field label={t("settings.webhookUrl")}>
            <Input
              value={url}
              placeholder={t("settings.webhookUrlPlaceholder")}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
          {notice && <InlineNotice>{notice}</InlineNotice>}
          <Button variant="primary" disabled={!url.trim()} onClick={() => void create()}>
            {t("settings.addWebhook")}
          </Button>
          {secret && (
            <div className="key-reveal">
              <strong>{t("settings.webhookSecretTitle")}</strong>
              <InlineNotice>{t("settings.webhookSecretOnce")}</InlineNotice>
              <pre className="code-block">{secret}</pre>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("settings.webhooks")} />
        <CardBody>
          {loading ? (
            <LoadingBlock label={t("common.loading")} />
          ) : error ? (
            <StateBlock title={t("common.loadFailed")} text={errorMessage(t, error)} />
          ) : !data || data.length === 0 ? (
            <StateBlock title={t("settings.noWebhooks")} />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>URL</th>
                  <th>{t("settings.events")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((hook) => (
                  <tr key={hook.id}>
                    <td>{hook.url}</td>
                    <td>{hook.subscribed_events.join(", ")}</td>
                    <td className="row-actions">
                      <Button size="sm" onClick={() => void api.webhooks.test(hook.id)}>
                        {t("settings.testWebhook")}
                      </Button>
                      <Button size="sm" onClick={() => void api.webhooks.remove(hook.id).then(reload)}>
                        {t("common.delete")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("general");

  return (
    <>
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
      <RequireProject>
        {(projectId) => (
          <ProjectSettings projectId={projectId} tab={tab} setTab={setTab} t={t} />
        )}
      </RequireProject>
    </>
  );
}

function ProjectSettings({
  projectId,
  tab,
  setTab,
  t,
}: {
  projectId: string;
  tab: Tab;
  setTab: (tab: Tab) => void;
  t: TranslateFn;
}) {
  const { current } = useProjects();

  return (
    <>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "general", label: t("settings.tabGeneral") },
          { value: "webhooks", label: t("settings.tabWebhooks") },
        ]}
      />
      {tab === "general" && current && <General project={current} t={t} />}
      {tab === "webhooks" && <Webhooks projectId={projectId} t={t} />}
    </>
  );
}
