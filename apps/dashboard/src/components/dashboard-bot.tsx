"use client";

import { useEffect, useRef, useState } from "react";

import { IconArrowRight, IconChat, IconRefresh, IconX } from "@/components/icons";
import { IconButton } from "@/components/ui";
import { streamChat } from "@/lib/api/chat";
import { apiBaseUrl } from "@/lib/api/config";
import { useAuth } from "@/lib/auth/context";
import { errorMessage, useAsyncData } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useProjectKey } from "@/lib/project-key";

const DEFAULT_ACCENT = "#2f6df6";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Floating chat bot pinned to the dashboard (spec §6). It mirrors the embedded
 * widget so the user can test the real thing without leaving the dashboard.
 *
 * The launcher stays locked until the project is deployed on /embed. "Deployed"
 * means an embed-scoped publishable key is stored locally: /v1/chat only accepts
 * X-API-Key, and full keys are visible just once at creation, so the key the user
 * deployed is the only one this bot can use.
 */
export function DashboardBot({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const { api } = useAuth();
  const { key } = useProjectKey(projectId, "embed");
  const { data: config } = useAsyncData(
    () => api.projects.getWidgetConfig(projectId),
    [projectId],
  );

  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const conversationId = useRef<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const deployed = Boolean(key);
  const accent = config?.accent_color || DEFAULT_ACCENT;
  const botName = config?.bot_name?.trim() || t("bot.title");
  const greeting = config?.greeting?.trim() ?? "";
  const avatar = config?.bot_avatar_url ?? null;
  const chips = (config?.suggested_questions ?? []).map((q) => q.trim()).filter(Boolean);

  // Follow the newest message as tokens stream in.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [turns, open]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy || !key) return;

    setInput("");
    setBusy(true);
    setTurns((prev) => [
      ...prev,
      { role: "user", content: message },
      { role: "assistant", content: "" },
    ]);

    try {
      await streamChat(
        {
          baseUrl: apiBaseUrl(),
          apiKey: key,
          message,
          conversationId: conversationId.current,
        },
        {
          onConversation: (data) => {
            conversationId.current = data.conversation_id;
          },
          onToken: (chunk) => {
            setTurns((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              next[next.length - 1] = { ...last, content: last.content + chunk };
              return next;
            });
          },
        },
      );
    } catch (err) {
      setTurns((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: errorMessage(t, err) };
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    conversationId.current = null;
    setTurns([]);
    setInput("");
  }

  if (!open) {
    return (
      <div className="dashboard-bot">
        <button
          type="button"
          className="dashboard-bot__launcher"
          style={deployed ? { background: accent } : undefined}
          disabled={!deployed}
          onClick={() => setOpen(true)}
          aria-label={deployed ? t("bot.open") : t("bot.locked")}
          title={deployed ? t("bot.open") : t("bot.lockedHint")}
        >
          {deployed && avatar ? (
            <img src={avatar} alt="" referrerPolicy="no-referrer" />
          ) : (
            <IconChat size={22} />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard-bot is-open">
      <div className="widget-chat">
        <div className="widget-chat__header" style={{ background: accent }}>
          <span
            className="widget-chat__avatar"
            style={
              avatar
                ? {
                    backgroundImage: `url("${avatar}")`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
          >
            {avatar ? null : botName.slice(0, 1).toUpperCase()}
          </span>
          <span className="widget-chat__name">{botName}</span>
          <IconButton label={t("bot.newChat")} onClick={reset}>
            <IconRefresh size={16} />
          </IconButton>
          <IconButton label={t("bot.close")} onClick={() => setOpen(false)}>
            <IconX size={16} />
          </IconButton>
        </div>

        <div className="widget-chat__log" ref={logRef}>
          {greeting && <div className="widget-chat__bubble">{greeting}</div>}
          {turns.map((turn, i) => (
            <div
              key={i}
              className={
                turn.role === "user" ? "widget-chat__bubble is-user" : "widget-chat__bubble"
              }
            >
              {turn.content || (busy && i === turns.length - 1 ? `${t("bot.thinking")}...` : "")}
            </div>
          ))}
        </div>

        <div className="widget-chat__footer">
          {chips.length > 0 && turns.length === 0 && (
            <div className="widget-chat__starters">
              {chips.map((q, i) => (
                <button
                  key={i}
                  type="button"
                  className="widget-chat__starter is-clickable"
                  onClick={() => void send(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <form
            className="widget-chat__composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <input
              className="widget-chat__input is-live"
              value={input}
              placeholder={t("bot.inputPlaceholder")}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              type="submit"
              className="widget-chat__send"
              style={{ background: accent }}
              disabled={busy || !input.trim()}
              aria-label={t("bot.send")}
            >
              <IconArrowRight size={18} />
            </button>
          </form>
        </div>

        <div className="widget-chat__branding">
          {t("widget.poweredBy")} <strong>proprAI</strong>
        </div>
      </div>
    </div>
  );
}
