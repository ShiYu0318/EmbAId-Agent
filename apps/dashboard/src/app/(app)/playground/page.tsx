"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { PageHeader, RequireProject } from "@/components/page";
import { Button, Card, CardBody, Field, InlineNotice, Input, Textarea } from "@/components/ui";
import { streamChat } from "@/lib/api/chat";
import { apiBaseUrl } from "@/lib/api/config";
import type { Citation, RetrievalTrace } from "@/lib/api/types";
import { useI18n, type TranslateFn } from "@/lib/i18n";
import { useProjectKey } from "@/lib/project-key";

interface Turn {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  trace?: RetrievalTrace;
  messageId?: string;
}

function KeyGate({ projectId, t }: { projectId: string; t: TranslateFn }) {
  const { key, setKey, clearKey } = useProjectKey(projectId);
  const [draft, setDraft] = useState("");

  if (!key) {
    return (
      <Card>
        <CardBody>
          <Field label={t("playground.keyRequired")} hint={t("playground.keyHint")}>
            <Input
              value={draft}
              placeholder={t("playground.keyPlaceholder")}
              onChange={(e) => setDraft(e.target.value)}
            />
          </Field>
          <Button variant="primary" disabled={!draft.trim()} onClick={() => setKey(draft)}>
            {t("playground.setKey")}
          </Button>
        </CardBody>
      </Card>
    );
  }

  return <Conversation projectKey={key} onChangeKey={clearKey} t={t} />;
}

function Conversation({
  projectKey,
  onChangeKey,
  t,
}: {
  projectKey: string;
  onChangeKey: () => void;
  t: TranslateFn;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationId = useRef<string | null>(null);

  const isSecret = projectKey.startsWith("sk_");

  async function send() {
    const message = input.trim();
    if (!message || busy) return;

    setInput("");
    setError(null);
    setBusy(true);
    setTurns((prev) => [...prev, { role: "user", content: message }, { role: "assistant", content: "" }]);

    try {
      await streamChat(
        {
          baseUrl: apiBaseUrl(),
          apiKey: projectKey,
          message,
          conversationId: conversationId.current,
        },
        {
          onConversation: (data) => {
            conversationId.current = data.conversation_id;
            setTurns((prev) => {
              const next = [...prev];
              next[next.length - 1] = { ...next[next.length - 1], messageId: data.message_id };
              return next;
            });
          },
          onToken: (text) => {
            setTurns((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              next[next.length - 1] = { ...last, content: last.content + text };
              return next;
            });
          },
          onCitations: (items) => {
            setTurns((prev) => {
              const next = [...prev];
              next[next.length - 1] = { ...next[next.length - 1], citations: items };
              return next;
            });
          },
          onTrace: (trace) => {
            setTurns((prev) => {
              const next = [...prev];
              next[next.length - 1] = { ...next[next.length - 1], trace };
              return next;
            });
          },
        },
      );
    } catch {
      setError(t("playground.streamError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="playground">
      <div className="playground-toolbar">
        {isSecret && <InlineNotice>{t("playground.secretKeyNote")}</InlineNotice>}
        <div className="playground-toolbar-actions">
          <Button
            onClick={() => {
              conversationId.current = null;
              setTurns([]);
            }}
          >
            {t("playground.newChat")}
          </Button>
          <Button onClick={onChangeKey}>{t("playground.changeKey")}</Button>
        </div>
      </div>

      <div className="playground-log">
        {turns.length === 0 ? (
          <p className="playground-empty">{t("playground.emptyState")}</p>
        ) : (
          turns.map((turn, index) => (
            <div key={index} className={`playground-turn ${turn.role}`}>
              <span className="playground-role">
                {turn.role === "user" ? t("playground.you") : t("playground.assistant")}
              </span>
              <div className="playground-bubble">{turn.content || (busy ? t("playground.thinking") : "")}</div>
              {turn.citations && turn.citations.length > 0 && (
                <ul className="playground-citations">
                  {turn.citations.map((citation, i) => (
                    <li key={citation.chunk_id}>
                      {i + 1}.{" "}
                      {citation.url ? (
                        <a href={citation.url} target="_blank" rel="noopener noreferrer">
                          {citation.title}
                        </a>
                      ) : (
                        citation.title
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {turn.role === "assistant" && turn.messageId && (
                <Link className="playground-trace-link" href={`/trace?message=${turn.messageId}`}>
                  {t("playground.viewTrace")}
                </Link>
              )}
            </div>
          ))
        )}
      </div>

      {error && <InlineNotice>{error}</InlineNotice>}

      <div className="playground-composer">
        <Textarea
          rows={2}
          value={input}
          placeholder={t("playground.messagePlaceholder")}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button variant="primary" loading={busy} onClick={() => void send()}>
          {t("playground.send")}
        </Button>
      </div>
    </div>
  );
}

export default function PlaygroundPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t("playground.title")} subtitle={t("playground.subtitle")} />
      <RequireProject>{(projectId) => <KeyGate projectId={projectId} t={t} />}</RequireProject>
    </>
  );
}
