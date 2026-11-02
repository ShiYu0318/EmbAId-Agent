"use client";

import { useEffect, useState } from "react";

import { InstallVerifier } from "@/components/install-verifier";
import { PageHeader, RequireProject } from "@/components/page";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  Field,
  InlineNotice,
  InlineSuccess,
  Input,
  LoadingBlock,
  Select,
  StateBlock,
} from "@/components/ui";
import { apiBaseUrl } from "@/lib/api/config";
import type { ApiKey, ApiKeyType } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/context";
import { errorMessage, useAsyncData, useCopy } from "@/lib/hooks";
import { useI18n, type TranslateFn } from "@/lib/i18n";
import { useProjectKey } from "@/lib/project-key";

// Mirrors DEFAULT_API_URL in apps/widget/src/index.ts — the snippet only pins
// data-api-url when the dashboard talks to a different API than that default.
const DEFAULT_WIDGET_API = "https://api.embaid.chat";
const WIDGET_SRC = process.env.NEXT_PUBLIC_WIDGET_URL ?? "https://cdn.embaid.chat/widget.js";

function buildSnippet(projectId: string, key: string): string {
  const base = apiBaseUrl().replace(/\/$/, "");
  const attrs = [`  data-key="${key}"`, `  data-project="${projectId}"`];
  if (base !== DEFAULT_WIDGET_API) attrs.push(`  data-api-url="${base}"`);
  return `<script src="${WIDGET_SRC}"\n${attrs.join("\n")}></script>`;
}

interface KeysStore {
  data: ApiKey[] | null;
  loading: boolean;
  error: unknown;
  reload: () => void;
}

type EditMode = "rename" | "origins";

interface Editing {
  key: ApiKey;
  mode: EditMode;
}

function KeyEditor({
  projectId,
  editing,
  onClose,
  onSaved,
  t,
}: {
  projectId: string;
  editing: Editing;
  onClose: () => void;
  onSaved: () => void;
  t: TranslateFn;
}) {
  const { api } = useAuth();
  const [name, setName] = useState(editing.key.name);
  const [origins, setOrigins] = useState(editing.key.allowed_origins.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body =
        editing.mode === "rename"
          ? { name: name.trim() || editing.key.name }
          : {
              allowed_origins: origins
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            };
      await api.apiKeys.update(projectId, editing.key.id, body);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={editing.mode === "rename" ? t("embed.renameTitle") : t("embed.editOrigins")}
      onClose={onClose}
      closeLabel={t("common.close")}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      {editing.mode === "rename" ? (
        <Field label={t("embed.keyName")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      ) : (
        <Field label={t("embed.allowedOrigins")} hint={t("embed.allowedOriginsHint")}>
          <Input
            value={origins}
            placeholder="https://example.com"
            onChange={(e) => setOrigins(e.target.value)}
          />
        </Field>
      )}
      {error && <InlineNotice>{error}</InlineNotice>}
    </Dialog>
  );
}

function KeysPanel({
  projectId,
  keys,
  onCreated,
  t,
}: {
  projectId: string;
  keys: KeysStore;
  onCreated: (key: string) => void;
  t: TranslateFn;
}) {
  const { api } = useAuth();
  const { data, loading, error, reload } = keys;
  const [type, setType] = useState<ApiKeyType>("publishable");
  const [name, setName] = useState("");
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [copiedRaw, copyRaw] = useCopy();
  const [copiedPrefix, copyPrefix] = useCopy();

  async function create() {
    setBusy(true);
    try {
      const created = await api.apiKeys.create(projectId, { type, name: name || "default" });
      setRawKey(created.key);
      setName("");
      // A publishable key is what the embed snippet needs — offer it to the right panel.
      if (created.type === "publishable") onCreated(created.key);
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(key: ApiKey) {
    if (!window.confirm(t("embed.revokeConfirm"))) return;
    await api.apiKeys.revoke(projectId, key.id);
    reload();
  }

  return (
    <div className="stack">
      <Card>
        <CardHeader title={t("embed.createKey")} />
        <CardBody>
          <div className="form-row">
            <Field label={t("embed.keyType")}>
              <Select value={type} onChange={(e) => setType(e.target.value as ApiKeyType)}>
                <option value="publishable">{t("embed.keyTypePublishable")}</option>
                <option value="secret">{t("embed.keyTypeSecret")}</option>
                <option value="sandbox">{t("embed.keyTypeSandbox")}</option>
              </Select>
            </Field>
            <Field label={t("embed.keyName")}>
              <Input
                value={name}
                placeholder={t("embed.keyNamePlaceholder")}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </div>
          {type === "secret" && <InlineNotice>{t("embed.keyWarning")}</InlineNotice>}
          <Button variant="primary" loading={busy} onClick={() => void create()}>
            {t("embed.createKey")}
          </Button>

          {rawKey && (
            <div className="key-reveal">
              <strong>{t("embed.keyShownOnceTitle")}</strong>
              <InlineNotice>{t("embed.keyShownOnce")}</InlineNotice>
              <pre className="code-block">{rawKey}</pre>
              <Button onClick={() => copyRaw(rawKey)}>
                {copiedRaw ? t("common.copied") : t("embed.copyKey")}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("embed.keysTitle")} subtitle={t("embed.copyPrefixHint")} />
        <CardBody>
          {loading ? (
            <LoadingBlock label={t("common.loading")} />
          ) : error ? (
            <StateBlock title={t("common.loadFailed")} text={errorMessage(t, error)} />
          ) : !data || data.length === 0 ? (
            <StateBlock title={t("embed.noKeys")} />
          ) : (
            <ul className="key-list">
              {data.map((key) => (
                <li key={key.id} className={key.revoked_at ? "key-card is-revoked" : "key-card"}>
                  <div className="key-card__head">
                    <span className="key-card__name" title={key.name}>
                      {key.name}
                    </span>
                    <Badge tone={key.type === "secret" ? "danger" : "neutral"}>{key.type}</Badge>
                    {key.revoked_at && <Badge tone="neutral">{t("embed.revoked")}</Badge>}
                  </div>

                  <code className="key-card__prefix">{key.key_prefix}</code>

                  <div className="key-card__meta">
                    <span>
                      {t("embed.allowedOrigins")}:{" "}
                      {key.allowed_origins.length > 0 ? key.allowed_origins.join(", ") : "*"}
                    </span>
                    <span>
                      {t("embed.rateLimit")}: {key.rate_limit_per_minute}
                    </span>
                  </div>

                  {!key.revoked_at && (
                    <div className="key-card__actions">
                      <Button size="sm" onClick={() => copyPrefix(key.key_prefix)}>
                        {copiedPrefix ? t("common.copied") : t("embed.copyPrefix")}
                      </Button>
                      <Button size="sm" onClick={() => setEditing({ key, mode: "rename" })}>
                        {t("embed.rename")}
                      </Button>
                      <Button size="sm" onClick={() => setEditing({ key, mode: "origins" })}>
                        {t("embed.editOrigins")}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => void revoke(key)}>
                        {t("embed.revoke")}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {editing && (
        <KeyEditor
          projectId={projectId}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={reload}
          t={t}
        />
      )}
    </div>
  );
}

function SnippetPanel({
  projectId,
  keys,
  candidateKey,
  t,
}: {
  projectId: string;
  keys: KeysStore;
  candidateKey: string | null;
  t: TranslateFn;
}) {
  const { api } = useAuth();
  // The deployed key doubles as the "is this project live?" flag that unlocks the
  // floating dashboard bot — see DashboardBot.
  const { key: deployedKey, setKey, clearKey } = useProjectKey(projectId, "embed");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, copy] = useCopy();

  // A key minted on the left lands here so the user never has to copy it by hand.
  useEffect(() => {
    if (candidateKey) {
      setDraft(candidateKey);
      setError(null);
    }
  }, [candidateKey]);

  /**
   * The floating bot calls /v1/chat from the dashboard's own origin. If the key is
   * scoped to specific origins, the dashboard must be one of them or the bot gets a
   * 403 (§7.6).
   *
   * An empty list already allows every origin, so it is left untouched on purpose:
   * appending here would turn "allow anywhere" into "allow only the dashboard" and
   * lock out the customer's own site.
   */
  async function allowDashboardOrigin(fullKey: string) {
    const match = keys.data?.find((k) => !k.revoked_at && fullKey.startsWith(k.key_prefix));
    if (!match || match.allowed_origins.length === 0) return;

    const origin = window.location.origin;
    if (match.allowed_origins.includes(origin)) return;

    try {
      await api.apiKeys.update(projectId, match.id, {
        allowed_origins: [...match.allowed_origins, origin],
      });
      setNotice(t("embed.originAdded", { origin }));
      keys.reload();
    } catch {
      // Deploying still succeeds; the bot just may not reach the API from here.
      setNotice(t("embed.originAddFailed", { origin }));
    }
  }

  async function deploy() {
    const value = draft.trim();
    if (!value.startsWith("pub_")) {
      setError(t("embed.keyMustBePublishable"));
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await allowDashboardOrigin(value);
      setKey(value);
    } finally {
      setBusy(false);
    }
  }

  const snippet = deployedKey ? buildSnippet(projectId, deployedKey) : null;

  return (
    <Card>
      <CardHeader title={t("embed.snippetTitle")} subtitle={t("embed.snippetSubtitle")} />
      <CardBody>
        <Field label={t("embed.keyField")} hint={t("embed.keyFieldHint")}>
          <Input
            value={draft}
            placeholder={t("embed.keyPlaceholder")}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
          />
        </Field>
        {error && <InlineNotice>{error}</InlineNotice>}

        <div className="row-actions">
          <Button
            variant="primary"
            loading={busy}
            disabled={!draft.trim()}
            onClick={() => void deploy()}
          >
            {deployedKey ? t("embed.redeploy") : t("embed.deploy")}
          </Button>
          {deployedKey && (
            <Button
              onClick={() => {
                clearKey();
                setDraft("");
                setNotice(null);
              }}
            >
              {t("embed.clearDeploy")}
            </Button>
          )}
        </div>

        {notice && <InlineNotice>{notice}</InlineNotice>}

        {snippet ? (
          <div className="stack">
            <InlineSuccess>{t("embed.deployed")}</InlineSuccess>
            <p className="muted">{t("embed.deployHint")}</p>
            <pre className="code-block">{snippet}</pre>
            <Button onClick={() => copy(snippet)}>
              {copied ? t("common.copied") : t("embed.copySnippet")}
            </Button>
          </div>
        ) : (
          <p className="muted">{t("embed.notDeployed")}</p>
        )}
      </CardBody>
    </Card>
  );
}

function EmbedSettings({ projectId, t }: { projectId: string; t: TranslateFn }) {
  const { api } = useAuth();
  // Both panels work off one key list: the left one edits it, and the right one
  // needs it to find the key being deployed so it can widen its allowed origins.
  const keys = useAsyncData(() => api.apiKeys.list(projectId), [projectId]);
  // Full keys exist only at creation time, so hand the freshly minted one straight
  // to the snippet panel instead of asking the user to keep it somewhere.
  const [freshKey, setFreshKey] = useState<string | null>(null);

  return (
    <div className="stack">
      <InstallVerifier projectId={projectId} />
      <div className="embed-layout">
        <KeysPanel projectId={projectId} keys={keys} onCreated={setFreshKey} t={t} />
        <SnippetPanel projectId={projectId} keys={keys} candidateKey={freshKey} t={t} />
      </div>
    </div>
  );
}

export default function EmbedPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t("embed.title")} subtitle={t("embed.subtitle")} />
      <RequireProject>{(projectId) => <EmbedSettings projectId={projectId} t={t} />}</RequireProject>
    </>
  );
}
