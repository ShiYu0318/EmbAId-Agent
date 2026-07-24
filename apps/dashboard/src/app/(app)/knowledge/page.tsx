"use client";

import { useMemo, useRef, useState } from "react";

import {
  IconChevronDown,
  IconChevronRight,
  IconCheck,
  IconDocument,
  IconFolder,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTag,
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
import type { DocumentSummary, Source, Tag } from "@/lib/api/types";
import { formatDateTime, formatNumber } from "@/lib/format";
import { errorMessage, useAsyncData, usePoll } from "@/lib/hooks";
import { useI18n, type Locale, type TranslateFn } from "@/lib/i18n";

const UPLOAD_ACCEPT =
  ".pdf,.md,.markdown,.txt,.html,.htm,application/pdf,text/markdown,text/plain,text/html";

const UPLOAD_TYPE = "upload";
const TYPE_ORDER = [UPLOAD_TYPE, "url_crawl", "sitemap", "notion", "google_docs"];

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

function documentTypeLabel(type: string, t: TranslateFn): string {
  if (type === UPLOAD_TYPE) return t("knowledge.sourceTypeUpload");
  return sourceTypeLabel(type, t);
}

function documentType(doc: DocumentSummary, sourceTypeById: Map<string, string>): string {
  if (!doc.source_id) return UPLOAD_TYPE;
  return sourceTypeById.get(doc.source_id) ?? UPLOAD_TYPE;
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

function KbStats({
  docs,
  chunks,
  tokens,
  locale,
  t,
}: {
  docs: number;
  chunks: number;
  tokens: number;
  locale: Locale;
  t: TranslateFn;
}) {
  return (
    <div className="kb-stats">
      <div className="kb-stat">
        <span className="kb-stat__value">{formatNumber(docs, locale)}</span>
        <span className="kb-stat__label">{t("knowledge.statDocuments")}</span>
      </div>
      <div className="kb-stat">
        <span className="kb-stat__value">{formatNumber(chunks, locale)}</span>
        <span className="kb-stat__label">{t("knowledge.statChunks")}</span>
      </div>
      <div className="kb-stat">
        <span className="kb-stat__value">{formatNumber(tokens, locale)}</span>
        <span className="kb-stat__label">{t("knowledge.statTokens")}</span>
      </div>
    </div>
  );
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

function DocumentTagsDialog({
  doc,
  tags,
  onClose,
  onSaved,
  t,
}: {
  doc: DocumentSummary;
  tags: Tag[];
  onClose: () => void;
  onSaved: () => void;
  t: TranslateFn;
}) {
  const { api } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(tags.filter((tag) => doc.tags.includes(tag.name)).map((tag) => tag.id)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.documents.setTags(doc.id, Array.from(selected));
      onSaved();
    } catch (err) {
      setError(errorMessage(t, err));
      setSaving(false);
    }
  }

  return (
    <Dialog
      title={t("knowledge.manageDocumentTags")}
      onClose={onClose}
      closeLabel={t("common.close")}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="kb-tagpicker__doc" title={doc.title}>
        {doc.title}
      </div>
      {tags.length === 0 ? (
        <StateBlock title={t("knowledge.noTagsToAssign")} />
      ) : (
        <div className="kb-tagpicker">
          {tags.map((tag) => {
            const on = selected.has(tag.id);
            return (
              <button
                type="button"
                key={tag.id}
                className={on ? "kb-tagchip is-on" : "kb-tagchip"}
                aria-pressed={on}
                onClick={() => toggle(tag.id)}
              >
                {on ? <IconCheck size={13} /> : <IconPlus size={13} />}
                {tag.name}
              </button>
            );
          })}
        </div>
      )}
      {error && <InlineNotice>{error}</InlineNotice>}
    </Dialog>
  );
}

function TagManagerDialog({
  projectId,
  tags,
  docCountByTag,
  onClose,
  onChanged,
  t,
  locale,
}: {
  projectId: string;
  tags: Tag[];
  docCountByTag: Map<string, number>;
  onClose: () => void;
  onChanged: () => void;
  t: TranslateFn;
  locale: Locale;
}) {
  const { api } = useAuth();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      await api.tags.create(projectId, name);
      setNewName("");
      onChanged();
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setCreating(false);
    }
  }

  async function saveRename(id: string) {
    const name = editName.trim();
    if (!name) return;
    setBusyId(id);
    setError(null);
    try {
      await api.tags.update(id, name);
      setEditingId(null);
      onChanged();
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(tag: Tag) {
    if (!window.confirm(t("knowledge.deleteTagConfirm"))) return;
    setBusyId(tag.id);
    setError(null);
    try {
      await api.tags.remove(tag.id);
      onChanged();
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog title={t("knowledge.manageTags")} onClose={onClose} closeLabel={t("common.close")}>
      <p className="kb-tagmgr__hint">{t("knowledge.tagManagerHint")}</p>
      <form
        className="kb-tagmgr__create"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Input
          value={newName}
          placeholder={t("knowledge.tagNamePlaceholder")}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Button type="submit" variant="primary" loading={creating} disabled={!newName.trim()}>
          {t("knowledge.addTag")}
        </Button>
      </form>

      {tags.length === 0 ? (
        <StateBlock title={t("knowledge.noTags")} />
      ) : (
        <ul className="kb-tagmgr__list">
          {tags.map((tag) => {
            const busy = busyId === tag.id;
            const editing = editingId === tag.id;
            return (
              <li key={tag.id} className="kb-tagmgr__item">
                {editing ? (
                  <>
                    <Input
                      value={editName}
                      autoFocus
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveRename(tag.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                    <div className="kb-tagmgr__actions">
                      <Button
                        size="sm"
                        variant="primary"
                        loading={busy}
                        disabled={!editName.trim()}
                        onClick={() => void saveRename(tag.id)}
                      >
                        {t("common.save")}
                      </Button>
                      <Button size="sm" onClick={() => setEditingId(null)}>
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="kb-tagmgr__name">
                      <span className="kb-tag">{tag.name}</span>
                      <span className="kb-tagmgr__count">
                        {t("knowledge.tagDocCount", {
                          count: formatNumber(docCountByTag.get(tag.name) ?? 0, locale),
                        })}
                      </span>
                    </span>
                    <div className="kb-tagmgr__actions">
                      <button
                        type="button"
                        className="kb-icon-btn"
                        title={t("knowledge.renameTag")}
                        aria-label={t("knowledge.renameTag")}
                        disabled={busy}
                        onClick={() => {
                          setEditingId(tag.id);
                          setEditName(tag.name);
                        }}
                      >
                        <IconPencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="kb-icon-btn is-danger"
                        title={t("knowledge.deleteTag")}
                        aria-label={t("knowledge.deleteTag")}
                        disabled={busy}
                        onClick={() => void remove(tag)}
                      >
                        <IconTrash size={15} />
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && <InlineNotice>{error}</InlineNotice>}
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
        <span className="kb-soon" data-hint={t("knowledge.googleDriveHint")} title={t("knowledge.googleDriveHint")}>
          <Button disabled>{t("knowledge.googleDrive")}</Button>
        </span>
        {/* Paste-text endpoint not built yet — out of scope this phase. */}
        <span className="kb-soon" data-hint={t("knowledge.pastedTextHint")} title={t("knowledge.pastedTextHint")}>
          <Button disabled>{t("knowledge.pastedText")}</Button>
        </span>
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
  onManageTags,
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
  onManageTags: () => void;
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
      <td className="kb-num">{formatNumber(doc.chunk_count, locale)}</td>
      <td className="kb-num">{formatNumber(doc.token_count, locale)}</td>
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
            title={t("knowledge.manageDocumentTags")}
            aria-label={t("knowledge.manageDocumentTags")}
            onClick={onManageTags}
          >
            <IconTag size={16} />
          </button>
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
      <td className="kb-num">{formatNumber(chunkTotal, locale)}</td>
      <td className="kb-num">{formatNumber(tokenTotal, locale)}</td>
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

  const reloadTags = () => {
    docsQ.reload();
    tagsQ.reload();
  };

  const pending =
    Boolean(sourcesQ.data?.some((s) => isPending(s.status))) ||
    Boolean(docsQ.data?.some((d) => isPending(d.status)));
  usePoll(pending, reload);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [viewId, setViewId] = useState<string | null>(null);
  const [renameDoc, setRenameDoc] = useState<DocumentSummary | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [tagDoc, setTagDoc] = useState<DocumentSummary | null>(null);
  const [showTagManager, setShowTagManager] = useState(false);

  const sources = useMemo(() => sourcesQ.data ?? [], [sourcesQ.data]);
  const documents = useMemo(() => docsQ.data ?? [], [docsQ.data]);
  const tags = useMemo(() => tagsQ.data ?? [], [tagsQ.data]);

  const sourceTypeById = useMemo(() => {
    const map = new Map<string, string>();
    for (const source of sources) map.set(source.id, source.type);
    return map;
  }, [sources]);

  const stats = useMemo(() => {
    let chunks = 0;
    let tokens = 0;
    for (const doc of documents) {
      chunks += doc.chunk_count;
      tokens += doc.token_count;
    }
    return { docs: documents.length, chunks, tokens };
  }, [documents]);

  const typeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const doc of documents) {
      const type = documentType(doc, sourceTypeById);
      map.set(type, (map.get(type) ?? 0) + 1);
    }
    return map;
  }, [documents, sourceTypeById]);

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const doc of documents) {
      for (const name of doc.tags) map.set(name, (map.get(name) ?? 0) + 1);
    }
    return map;
  }, [documents]);

  const typeOptions = useMemo(() => {
    const ordered = TYPE_ORDER.filter((type) => typeCounts.has(type));
    const extras = [...typeCounts.keys()].filter((type) => !TYPE_ORDER.includes(type));
    return [...ordered, ...extras];
  }, [typeCounts]);

  const filteredDocs = useMemo(
    () =>
      documents.filter((doc) => {
        if (tagFilter && !doc.tags.includes(tagFilter)) return false;
        if (typeFilter && documentType(doc, sourceTypeById) !== typeFilter) return false;
        return true;
      }),
    [documents, tagFilter, typeFilter, sourceTypeById],
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

  const anyFilter = Boolean(tagFilter || typeFilter);
  const visibleSources = anyFilter
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

  return (
    <div className="stack">
      <DropZone projectId={projectId} onChanged={reload} t={t} />

      <Card>
        <CardHeader
          title={t("knowledge.documentList")}
          action={
            <div className="kb-toolbar">
              {typeOptions.length > 0 && (
                <Select
                  className="kb-filter"
                  aria-label={t("knowledge.filterByType")}
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="">{t("knowledge.allTypes")}</option>
                  {typeOptions.map((type) => (
                    <option key={type} value={type}>
                      {documentTypeLabel(type, t)} ({formatNumber(typeCounts.get(type) ?? 0, locale)})
                    </option>
                  ))}
                </Select>
              )}
              {tags.length > 0 && (
                <Select
                  className="kb-filter"
                  aria-label={t("knowledge.filterByTag")}
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                >
                  <option value="">{t("knowledge.allTags")}</option>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.name}>
                      {tag.name} ({formatNumber(tagCounts.get(tag.name) ?? 0, locale)})
                    </option>
                  ))}
                </Select>
              )}
              <Button size="sm" onClick={() => setShowTagManager(true)}>
                <IconTag size={15} />
                {t("knowledge.manageTags")}
              </Button>
            </div>
          }
        />
        <CardBody>
          {loading ? (
            <SkeletonTable rows={5} cols={6} />
          ) : error ? (
            <StateBlock title={t("common.loadFailed")} text={errorMessage(t, error)} />
          ) : (
            <>
              {documents.length > 0 && (
                <KbStats docs={stats.docs} chunks={stats.chunks} tokens={stats.tokens} locale={locale} t={t} />
              )}
              {isEmpty ? (
                anyFilter ? (
                  <StateBlock title={t("knowledge.noFilterMatch")} />
                ) : (
                  <StateBlock title={t("knowledge.empty")} text={t("knowledge.emptyHint")} />
                )
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
                                  onManageTags={() => setTagDoc(doc)}
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
                          onManageTags={() => setTagDoc(doc)}
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
            </>
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
      {tagDoc && (
        <DocumentTagsDialog
          doc={tagDoc}
          tags={tags}
          onClose={() => setTagDoc(null)}
          onSaved={() => {
            setTagDoc(null);
            reload();
          }}
          t={t}
        />
      )}
      {showTagManager && (
        <TagManagerDialog
          projectId={projectId}
          tags={tags}
          docCountByTag={tagCounts}
          onClose={() => setShowTagManager(false)}
          onChanged={reloadTags}
          t={t}
          locale={locale}
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
