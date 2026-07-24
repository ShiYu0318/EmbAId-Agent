"use client";

import { useMemo, useRef, useState } from "react";

import {
  IconChevronDown,
  IconChevronRight,
  IconDocument,
  IconFolder,
  IconPencil,
  IconRefresh,
  IconTrash,
  IconUpload,
} from "@/components/icons";
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
  Input,
  Select,
  SkeletonLines,
  SkeletonTable,
  Spinner,
  StateBlock,
  Toggle,
} from "@/components/ui";
import { useAuth } from "@/lib/auth/context";
import type { DocumentSummary, Source } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { errorMessage, useAsyncData, usePoll } from "@/lib/hooks";
import { useI18n, type Locale, type TranslateFn } from "@/lib/i18n";

const UPLOAD_ACCEPT =
  ".pdf,.md,.markdown,.txt,.html,.htm,application/pdf,text/markdown,text/plain,text/html";

function isPending(status: string): boolean {
  return status === "pending" || status === "processing";
}

function sourceTypeLabel(type: string, t: TranslateFn): string {
  switch (type) {
    case "url_crawl":
      return t("knowledge.sourceTypeUrlCrawl");
    case "sitemap":
      return t("knowledge.sourceTypeSitemap");
    case "notion":
      return t("knowledge.sourceTypeNotion");
    case "google_docs":
      return t("knowledge.sourceTypeGoogleDocs");
    default:
      return type;
  }
}

function IngestStatus({ status, t }: { status: string; t: TranslateFn }) {
  if (status === "ready") return <Badge tone="success">{t("knowledge.statusReady")}</Badge>;
  if (status === "failed") return <Badge tone="danger">{t("knowledge.statusFailed")}</Badge>;
  return (
    <Badge tone="info">
      <Spinner size={11} />
      {t("knowledge.statusProcessing")}
    </Badge>
  );
}

function DocStatus({ doc, t }: { doc: DocumentSummary; t: TranslateFn }) {
  if (doc.status === "ready") {
    return (
      <Badge tone={doc.is_stale ? "warning" : "success"}>
        {doc.is_stale ? t("knowledge.stale") : t("knowledge.fresh")}
      </Badge>
    );
  }
  return <IngestStatus status={doc.status} t={t} />;
}

function ChunkViewer({
  documentId,
  onClose,
  t,
}: {
  documentId: string;
  onClose: () => void;
  t: TranslateFn;
}) {
  const { api } = useAuth();
  const { data, loading, error } = useAsyncData(() => api.documents.get(documentId), [documentId]);

  return (
    <Dialog
      title={data?.title ?? t("knowledge.viewContent")}
      onClose={onClose}
      closeLabel={t("common.close")}
      wide
    >
      {loading ? (
        <SkeletonLines count={6} />
      ) : error ? (
        <StateBlock title={t("common.loadFailed")} text={errorMessage(t, error)} />
      ) : !data || data.chunks.length === 0 ? (
        <StateBlock title={t("knowledge.noChunks")} />
      ) : (
        <div className="chunk-list">
          {data.chunks.map((chunk) => (
            <div key={chunk.id} className="chunk-item">
              <div className="chunk-item__head">
                <span className="chunk-item__ordinal">
                  {t("knowledge.chunk")} #{chunk.ordinal + 1}
                </span>
                <span className="chunk-item__trust">
                  {t("knowledge.chunkTrust")} {chunk.trust_score.toFixed(2)}
                </span>
              </div>
              <div className="chunk-item__content">{chunk.content}</div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function RenameDialog({
  initialTitle,
  busy,
  onSave,
  onClose,
  t,
}: {
  initialTitle: string;
  busy: boolean;
  onSave: (title: string) => void;
  onClose: () => void;
  t: TranslateFn;
}) {
  const [title, setTitle] = useState(initialTitle);
  const trimmed = title.trim();

  return (
    <Dialog
      title={t("knowledge.renameDocTitle")}
      onClose={onClose}
      closeLabel={t("common.close")}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" loading={busy} disabled={!trimmed} onClick={() => onSave(trimmed)}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <Field label={t("knowledge.newTitle")}>
        <Input
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && trimmed && !busy) onSave(trimmed);
          }}
        />
      </Field>
    </Dialog>
  );
}

function DropZone({
  projectId,
  onChanged,
  t,
}: {
  projectId: string;
  onChanged: () => void;
  t: TranslateFn;
}) {
  const { api } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragover, setDragover] = useState(false);
  const [showWeb, setShowWeb] = useState(false);
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(25);
  const [crawling, setCrawling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    setNotice(null);
    try {
      for (const file of files) {
        await api.documents.upload(projectId, file);
      }
      onChanged();
    } catch (err) {
      setNotice(errorMessage(t, err) || t("knowledge.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function startCrawl() {
    if (!url.trim()) return;
    setCrawling(true);
    setNotice(null);
    try {
      await api.sources.create(projectId, {
        type: "url_crawl",
        config: { url: url.trim(), max_pages: maxPages },
      });
      setUrl("");
      setShowWeb(false);
      setNotice(t("knowledge.crawlStarted"));
      onChanged();
    } catch (err) {
      setNotice(errorMessage(t, err));
    } finally {
      setCrawling(false);
    }
  }

  return (
    <div
      className={dragover ? "kb-dropzone is-dragover" : "kb-dropzone"}
      onDragOver={(e) => {
        e.preventDefault();
        setDragover(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragover(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragover(false);
        void uploadFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <span className="kb-dropzone__icon">
        <IconUpload size={30} />
      </span>
      <div className="kb-dropzone__text">{t("knowledge.dropzoneText")}</div>
      <div className="kb-dropzone__hint">{t("knowledge.dropHint")}</div>

      <div className="kb-dropzone__actions">
        <Button variant="primary" loading={uploading} onClick={() => fileInput.current?.click()}>
          {t("knowledge.uploadFile")}
        </Button>
        <Button onClick={() => setShowWeb((v) => !v)}>{t("knowledge.addWebsite")}</Button>
        {/* Google Drive picker needs OAuth + Picker — out of scope this phase. */}
        <Button disabled title={t("knowledge.comingSoon")}>
          {t("knowledge.googleDrive")}
        </Button>
        {/* Paste-text endpoint not built yet — out of scope this phase. */}
        <Button disabled title={t("knowledge.comingSoon")}>
          {t("knowledge.pastedText")}
        </Button>
      </div>

      <input
        ref={fileInput}
        type="file"
        hidden
        multiple
        accept={UPLOAD_ACCEPT}
        onChange={(e) => {
          void uploadFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      {showWeb && (
        <form
          className="kb-web-form"
          onSubmit={(e) => {
            e.preventDefault();
            void startCrawl();
          }}
        >
          <div className="kb-web-form__row">
            <Field label={t("knowledge.crawlUrl")}>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
            </Field>
            <Field label={t("knowledge.maxPages")}>
              <Input
                type="number"
                min="1"
                max="500"
                value={maxPages}
                onChange={(e) => setMaxPages(Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>
          </div>
          <Button type="submit" variant="primary" loading={crawling} disabled={!url.trim()}>
            {t("knowledge.startCrawl")}
          </Button>
        </form>
      )}

      {notice && <InlineNotice>{notice}</InlineNotice>}
    </div>
  );
}

function DocRow({
  doc,
  child,
  busy,
  locale,
  t,
  onView,
  onRename,
  onToggle,
  onDelete,
}: {
  doc: DocumentSummary;
  child: boolean;
  busy: boolean;
  locale: Locale;
  t: TranslateFn;
  onView: () => void;
  onRename: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className={doc.enabled ? "kb-row" : "kb-row is-off"}>
      <td>
        <div className={child ? "kb-name is-child" : "kb-name"}>
          <span className="kb-name__icon">
            <IconDocument size={16} />
          </span>
          <span className="kb-name__label" title={doc.title}>
            {doc.title}
          </span>
          {doc.tags.length > 0 && (
            <span className="kb-tags">
              {doc.tags.map((tag) => (
                <span key={tag} className="kb-tag">
                  {tag}
                </span>
              ))}
            </span>
          )}
        </div>
      </td>
      <td>{doc.source_id ? "—" : t("knowledge.sourceTypeUpload")}</td>
      <td className="kb-time">{formatDateTime(doc.created_at, locale)}</td>
      <td className="kb-num">{doc.chunk_count.toLocaleString(locale)}</td>
      <td className="kb-num">{doc.token_count.toLocaleString(locale)}</td>
      <td>
        <DocStatus doc={doc} t={t} />
      </td>
      <td className="kb-actions-cell">
        <div className="kb-actions">
          <Toggle
            checked={doc.enabled}
            disabled={busy}
            onChange={onToggle}
            ariaLabel={doc.enabled ? t("knowledge.disableDocument") : t("knowledge.enableDocument")}
          />
          <button
            type="button"
            className="kb-icon-btn"
            title={t("knowledge.viewContent")}
            aria-label={t("knowledge.viewContent")}
            disabled={doc.chunk_count === 0}
            onClick={onView}
          >
            <IconDocument size={16} />
          </button>
          <button
            type="button"
            className="kb-icon-btn"
            title={t("knowledge.rename")}
            aria-label={t("knowledge.rename")}
            onClick={onRename}
          >
            <IconPencil size={16} />
          </button>
          <button
            type="button"
            className="kb-icon-btn is-danger"
            title={t("common.delete")}
            aria-label={t("common.delete")}
            disabled={busy}
            onClick={onDelete}
          >
            <IconTrash size={16} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function SourceRow({
  source,
  childDocs,
  expanded,
  busy,
  locale,
  t,
  onToggleExpand,
  onReindex,
  onDelete,
}: {
  source: Source;
  childDocs: DocumentSummary[];
  expanded: boolean;
  busy: boolean;
  locale: Locale;
  t: TranslateFn;
  onToggleExpand: () => void;
  onReindex: () => void;
  onDelete: () => void;
}) {
  const chunkTotal = childDocs.reduce((sum, d) => sum + d.chunk_count, 0);
  const tokenTotal = childDocs.reduce((sum, d) => sum + d.token_count, 0);

  return (
    <tr className="kb-folder-row">
      <td>
        <div className="kb-name">
          <button
            type="button"
            className="kb-expand"
            aria-expanded={expanded}
            aria-label={expanded ? t("knowledge.collapseFolder") : t("knowledge.expandFolder")}
            onClick={onToggleExpand}
          >
            {expanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          </button>
          <span className="kb-name__icon">
            <IconFolder size={16} />
          </span>
          <span className="kb-name__label">{sourceTypeLabel(source.type, t)}</span>
          <span className="kb-tag">{t("knowledge.subpageCount", { count: childDocs.length })}</span>
        </div>
      </td>
      <td>{sourceTypeLabel(source.type, t)}</td>
      <td className="kb-time">{formatDateTime(source.created_at, locale)}</td>
      <td className="kb-num">{chunkTotal.toLocaleString(locale)}</td>
      <td className="kb-num">{tokenTotal.toLocaleString(locale)}</td>
      <td>
        <IngestStatus status={source.status} t={t} />
      </td>
      <td className="kb-actions-cell">
        <div className="kb-actions">
          <button
            type="button"
            className="kb-icon-btn"
            title={t("knowledge.reindex")}
            aria-label={t("knowledge.reindex")}
            disabled={busy}
            onClick={onReindex}
          >
            <IconRefresh size={16} />
          </button>
          <button
            type="button"
            className="kb-icon-btn is-danger"
            title={t("common.delete")}
            aria-label={t("common.delete")}
            disabled={busy}
            onClick={onDelete}
          >
            <IconTrash size={16} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function KnowledgeBase({
  projectId,
  t,
  locale,
}: {
  projectId: string;
  t: TranslateFn;
  locale: Locale;
}) {
  const { api } = useAuth();
  const sourcesQ = useAsyncData(() => api.sources.list(projectId), [projectId]);
  const docsQ = useAsyncData(() => api.documents.list(projectId, { limit: 200 }), [projectId]);
  const tagsQ = useAsyncData(() => api.tags.list(projectId), [projectId]);

  const reload = () => {
    sourcesQ.reload();
    docsQ.reload();
  };

  const pending =
    Boolean(sourcesQ.data?.some((s) => isPending(s.status))) ||
    Boolean(docsQ.data?.some((d) => isPending(d.status)));
  usePoll(pending, reload);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState("");
  const [viewId, setViewId] = useState<string | null>(null);
  const [renameDoc, setRenameDoc] = useState<DocumentSummary | null>(null);
  const [renaming, setRenaming] = useState(false);

  const sources = sourcesQ.data ?? [];
  const documents = useMemo(() => docsQ.data ?? [], [docsQ.data]);

  const filteredDocs = useMemo(
    () => (tagFilter ? documents.filter((d) => d.tags.includes(tagFilter)) : documents),
    [documents, tagFilter],
  );

  const { docsBySource, standalone } = useMemo(() => {
    const map = new Map<string, DocumentSummary[]>();
    const loose: DocumentSummary[] = [];
    for (const doc of filteredDocs) {
      if (doc.source_id) {
        const list = map.get(doc.source_id);
        if (list) list.push(doc);
        else map.set(doc.source_id, [doc]);
      } else {
        loose.push(doc);
      }
    }
    return { docsBySource: map, standalone: loose };
  }, [filteredDocs]);

  const visibleSources = tagFilter
    ? sources.filter((s) => (docsBySource.get(s.id)?.length ?? 0) > 0)
    : sources;

  async function withBusy(id: string, fn: () => Promise<unknown>) {
    setBusy((prev) => new Set(prev).add(id));
    try {
      await fn();
      reload();
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function toggleExpand(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveRename(title: string) {
    if (!renameDoc) return;
    setRenaming(true);
    try {
      await api.documents.update(renameDoc.id, { title });
      setRenameDoc(null);
      reload();
    } finally {
      setRenaming(false);
    }
  }

  function deleteSource(source: Source) {
    if (!window.confirm(t("knowledge.deleteSourceConfirm"))) return;
    void withBusy(source.id, () => api.sources.remove(source.id));
  }

  const loading = (sourcesQ.loading && !sourcesQ.data) || (docsQ.loading && !docsQ.data);
  const error = sourcesQ.error ?? docsQ.error;
  const isEmpty = visibleSources.length === 0 && standalone.length === 0;
  const tags = tagsQ.data ?? [];

  return (
    <div className="stack">
      <DropZone projectId={projectId} onChanged={reload} t={t} />

      <Card>
        <CardHeader
          title={t("knowledge.documentList")}
          action={
            tags.length > 0 ? (
              <Select
                className="kb-toolbar__filter"
                aria-label={t("knowledge.filterByTag")}
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
              >
                <option value="">{t("knowledge.allTags")}</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.name}>
                    {tag.name}
                  </option>
                ))}
              </Select>
            ) : undefined
          }
        />
        <CardBody>
          {loading ? (
            <SkeletonTable rows={5} cols={6} />
          ) : error ? (
            <StateBlock title={t("common.loadFailed")} text={errorMessage(t, error)} />
          ) : isEmpty ? (
            <StateBlock title={t("knowledge.empty")} text={t("knowledge.emptyHint")} />
          ) : (
            <div className="kb-table-wrap">
              <table className="kb-table">
                <thead>
                  <tr>
                    <th>{t("knowledge.colName")}</th>
                    <th>{t("common.type")}</th>
                    <th>{t("common.createdAt")}</th>
                    <th className="kb-num">{t("knowledge.chunkCount")}</th>
                    <th className="kb-num">{t("knowledge.tokenCount")}</th>
                    <th>{t("common.status")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visibleSources.map((source) => {
                    const kids = docsBySource.get(source.id) ?? [];
                    const expanded = !collapsed.has(source.id);
                    return [
                      <SourceRow
                        key={source.id}
                        source={source}
                        childDocs={kids}
                        expanded={expanded}
                        busy={busy.has(source.id)}
                        locale={locale}
                        t={t}
                        onToggleExpand={() => toggleExpand(source.id)}
                        onReindex={() =>
                          void withBusy(source.id, () => api.sources.reindex(source.id))
                        }
                        onDelete={() => deleteSource(source)}
                      />,
                      ...(expanded
                        ? kids.map((doc) => (
                            <DocRow
                              key={doc.id}
                              doc={doc}
                              child
                              busy={busy.has(doc.id)}
                              locale={locale}
                              t={t}
                              onView={() => setViewId(doc.id)}
                              onRename={() => setRenameDoc(doc)}
                              onToggle={() =>
                                void withBusy(doc.id, () =>
                                  api.documents.update(doc.id, { enabled: !doc.enabled }),
                                )
                              }
                              onDelete={() =>
                                void withBusy(doc.id, () => api.documents.remove(doc.id))
                              }
                            />
                          ))
                        : []),
                    ];
                  })}
                  {standalone.map((doc) => (
                    <DocRow
                      key={doc.id}
                      doc={doc}
                      child={false}
                      busy={busy.has(doc.id)}
                      locale={locale}
                      t={t}
                      onView={() => setViewId(doc.id)}
                      onRename={() => setRenameDoc(doc)}
                      onToggle={() =>
                        void withBusy(doc.id, () =>
                          api.documents.update(doc.id, { enabled: !doc.enabled }),
                        )
                      }
                      onDelete={() => void withBusy(doc.id, () => api.documents.remove(doc.id))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {viewId && <ChunkViewer documentId={viewId} onClose={() => setViewId(null)} t={t} />}
      {renameDoc && (
        <RenameDialog
          initialTitle={renameDoc.title}
          busy={renaming}
          onSave={saveRename}
          onClose={() => setRenameDoc(null)}
          t={t}
        />
      )}
    </div>
  );
}

export default function KnowledgePage() {
  const { t, locale } = useI18n();

  return (
    <>
      <PageHeader title={t("knowledge.title")} subtitle={t("knowledge.subtitle")} />
      <RequireProject>
        {(projectId) => <KnowledgeBase projectId={projectId} t={t} locale={locale} />}
      </RequireProject>
    </>
  );
}
