"use client";

import { useRef, useState } from "react";

import { PageHeader, RequireProject } from "@/components/page";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  InlineNotice,
  Input,
  LoadingBlock,
  Select,
  StateBlock,
  Tabs,
} from "@/components/ui";
import { useAuth } from "@/lib/auth/context";
import type { SourceType } from "@/lib/api/types";
import { errorMessage, useAsyncData } from "@/lib/hooks";
import { useI18n, type TranslateFn } from "@/lib/i18n";

type Tab = "sources" | "documents" | "tags";

function Sources({ projectId, t }: { projectId: string; t: TranslateFn }) {
  const { api } = useAuth();
  const { data, loading, error, reload } = useAsyncData(() => api.sources.list(projectId), [projectId]);
  const [type, setType] = useState<SourceType>("url_crawl");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function addSource() {
    setBusy(true);
    setNotice(null);
    try {
      const config = type === "url_crawl" || type === "sitemap" ? { url } : {};
      await api.sources.create(projectId, { type, config });
      setUrl("");
      reload();
    } catch (err) {
      setNotice(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <Card>
        <CardHeader title={t("knowledge.addSource")} />
        <CardBody>
          <div className="form-row">
            <Field label={t("knowledge.sourceType")}>
              <Select value={type} onChange={(e) => setType(e.target.value as SourceType)}>
                <option value="url_crawl">{t("knowledge.sourceTypeUrlCrawl")}</option>
                <option value="sitemap">{t("knowledge.sourceTypeSitemap")}</option>
                <option value="notion">{t("knowledge.sourceTypeNotion")}</option>
                <option value="google_docs">{t("knowledge.sourceTypeGoogleDocs")}</option>
              </Select>
            </Field>
            {(type === "url_crawl" || type === "sitemap") && (
              <Field label={type === "sitemap" ? t("knowledge.sitemapUrl") : t("knowledge.crawlUrl")}>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
              </Field>
            )}
          </div>
          {notice && <InlineNotice>{notice}</InlineNotice>}
          <Button variant="primary" loading={busy} onClick={() => void addSource()}>
            {t("knowledge.addSource")}
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("knowledge.sourceList")} />
        <CardBody>
          {loading ? (
            <LoadingBlock label={t("common.loading")} />
          ) : error ? (
            <StateBlock title={t("common.loadFailed")} text={errorMessage(t, error)} />
          ) : !data || data.length === 0 ? (
            <StateBlock title={t("knowledge.noSources")} />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("common.type")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("knowledge.lastRun")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((source) => (
                  <tr key={source.id}>
                    <td>{source.type}</td>
                    <td>
                      <Badge tone={source.status === "ready" ? "success" : "neutral"}>
                        {source.status}
                      </Badge>
                    </td>
                    <td>{source.last_run_at ?? t("knowledge.neverRun")}</td>
                    <td>
                      <Button size="sm" onClick={() => void api.sources.reindex(source.id).then(reload)}>
                        {t("knowledge.reindex")}
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

function Documents({ projectId, t }: { projectId: string; t: TranslateFn }) {
  const { api } = useAuth();
  const [staleOnly, setStaleOnly] = useState(false);
  const { data, loading, error, reload } = useAsyncData(
    () => api.documents.list(projectId, { stale_only: staleOnly }),
    [projectId, staleOnly],
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onUpload(file: File) {
    setUploading(true);
    try {
      await api.documents.upload(projectId, file);
      reload();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="stack">
      <Card>
        <CardHeader
          title={t("knowledge.upload")}
          action={
            <Button variant="primary" loading={uploading} onClick={() => fileInput.current?.click()}>
              {t("knowledge.upload")}
            </Button>
          }
        />
        <CardBody>
          <p className="muted">{t("knowledge.dropHint")}</p>
          <input
            ref={fileInput}
            type="file"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onUpload(file);
            }}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("knowledge.documentList")}
          action={
            <label className="checkbox">
              <input
                type="checkbox"
                checked={staleOnly}
                onChange={(e) => setStaleOnly(e.target.checked)}
              />
              {t("knowledge.onlyStale")}
            </label>
          }
        />
        <CardBody>
          {loading ? (
            <LoadingBlock label={t("common.loading")} />
          ) : error ? (
            <StateBlock title={t("common.loadFailed")} text={errorMessage(t, error)} />
          ) : !data || data.length === 0 ? (
            <StateBlock title={t("knowledge.noDocuments")} />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("knowledge.documentTitle")}</th>
                  <th>{t("knowledge.chunkCount")}</th>
                  <th>{t("common.status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.title}</td>
                    <td>{doc.chunk_count}</td>
                    <td>
                      <Badge tone={doc.is_stale ? "warning" : "success"}>
                        {doc.is_stale ? t("knowledge.stale") : t("knowledge.fresh")}
                      </Badge>
                    </td>
                    <td className="row-actions">
                      {doc.is_stale && (
                        <Button size="sm" onClick={() => void api.documents.verify(doc.id).then(reload)}>
                          {t("knowledge.verify")}
                        </Button>
                      )}
                      <Button size="sm" onClick={() => void api.documents.remove(doc.id).then(reload)}>
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

function TagsPanel({ projectId, t }: { projectId: string; t: TranslateFn }) {
  const { api } = useAuth();
  const { data, loading, reload } = useAsyncData(() => api.tags.list(projectId), [projectId]);
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  async function addTag() {
    setNotice(null);
    try {
      await api.tags.create(projectId, name);
      setName("");
      reload();
    } catch {
      setNotice(t("knowledge.tagInUse"));
    }
  }

  return (
    <Card>
      <CardHeader title={t("knowledge.tabTags")} />
      <CardBody>
        <div className="form-row">
          <Input
            value={name}
            placeholder={t("knowledge.tagNamePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
          <Button variant="primary" disabled={!name.trim()} onClick={() => void addTag()}>
            {t("knowledge.addTag")}
          </Button>
        </div>
        {notice && <InlineNotice>{notice}</InlineNotice>}
        {loading ? (
          <LoadingBlock label={t("common.loading")} />
        ) : !data || data.length === 0 ? (
          <StateBlock title={t("knowledge.noTags")} />
        ) : (
          <div className="tag-list">
            {data.map((tag) => (
              <span key={tag.id} className="tag-chip">
                {tag.name}
                <button type="button" onClick={() => void api.tags.remove(tag.id).then(reload)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function KnowledgePage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("sources");

  return (
    <>
      <PageHeader title={t("knowledge.title")} subtitle={t("knowledge.subtitle")} />
      <RequireProject>
        {(projectId) => (
          <>
            <Tabs
              value={tab}
              onChange={setTab}
              options={[
                { value: "sources", label: t("knowledge.tabSources") },
                { value: "documents", label: t("knowledge.tabDocuments") },
                { value: "tags", label: t("knowledge.tabTags") },
              ]}
            />
            {tab === "sources" && <Sources projectId={projectId} t={t} />}
            {tab === "documents" && <Documents projectId={projectId} t={t} />}
            {tab === "tags" && <TagsPanel projectId={projectId} t={t} />}
          </>
        )}
      </RequireProject>
    </>
  );
}
