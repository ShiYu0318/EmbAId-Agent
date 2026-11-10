"use client";

import { useEffect, useRef } from "react";
import { ChatWidget } from "@embaid/widget/widget";
import type { EmbedOptions, Transport, WidgetConfig as EmbedConfig } from "@embaid/widget/types";

import type { WidgetConfig } from "@/lib/api/types";
import type { Locale } from "@/lib/i18n";

export const DEFAULT_ACCENT = "#0033ff";

/** Map the dashboard's widget settings onto what the embeddable widget reads. */
export function toEmbedConfig(config: WidgetConfig, locale: Locale): Partial<EmbedConfig> {
  return {
    primaryColor: config.accent_color || DEFAULT_ACCENT,
    greeting: config.greeting,
    starterQuestions: config.suggested_questions.map((q) => q.trim()).filter(Boolean),
    botName: config.bot_name,
    botAvatarUrl: config.bot_avatar_url,
    theme: config.theme ?? "auto",
    position: config.position ?? "bottom-right",
    locale,
  };
}

/**
 * Mounts the real embeddable widget (the same code visitors get) and tears it down
 * on unmount. `config` changes are applied in place.
 */
export function useChatWidget(
  options: EmbedOptions | null,
  target: () => HTMLElement | null,
  config?: Partial<EmbedConfig>,
): void {
  const widget = useRef<ChatWidget | null>(null);
  const latest = useRef(config);
  latest.current = config;
  const key = options ? `${options.apiUrl}|${options.apiKey}|${options.mode ?? "floating"}` : "";

  useEffect(() => {
    if (!options) return;
    const host = target();
    if (!host) return;
    let cancelled = false;
    const instance = new ChatWidget({ ...options, config: { ...options.config, ...latest.current } });
    void instance.mount(host).then(() => {
      if (cancelled) instance.destroy();
      else widget.current = instance;
    });
    return () => {
      cancelled = true;
      instance.destroy();
      widget.current = null;
    };
    // options are keyed so a re-render with equal values does not remount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const serialized = JSON.stringify(config ?? {});
  useEffect(() => {
    if (config) widget.current?.update(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);
}

/** A canned reply so the studio preview shows thinking, citations and confidence. */
export function previewTransport(sample: { answer: string; source: string; query: string }): Transport {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return async (_message, _id, h) => {
    h.onConversation?.("preview", "");
    h.onStatus?.("understand", {});
    await wait(350);
    h.onStatus?.("search", { query: sample.query });
    await wait(450);
    h.onStatus?.("rerank", { candidates: 12 });
    await wait(400);
    h.onStatus?.("compose", { sources: 1 });
    await wait(350);
    for (const piece of sample.answer.match(/.{1,6}/gsu) ?? []) {
      h.onToken?.(piece);
      await wait(30);
    }
    h.onCitations?.([{ chunkId: "", documentId: "", title: sample.source, url: null, snippet: "" }]);
    h.onDone?.({ answered: true, confidence: 0.86, flagged: false });
  };
}
