"use client";

import type { StreamStage } from "@/lib/api/chat";
import { quote, useI18n, type Locale, type TranslateFn } from "@/lib/i18n";

function describe(t: TranslateFn, locale: Locale, stage: StreamStage): { label: string; note: string; warn: boolean } {
  const n = (key: string) => Number(stage[key] ?? 0);
  switch (stage.stage) {
    case "understand":
      return { label: t("thinking.understand"), note: "", warn: false };
    case "cache_hit":
      return { label: t("thinking.cacheHit"), note: "", warn: false };
    case "search":
      return {
        label: t("thinking.search"),
        note: typeof stage.query === "string" && stage.query ? quote(locale, stage.query) : "",
        warn: false,
      };
    case "rerank":
      return { label: t(n("candidates") === 1 ? "thinking.rerankOne" : "thinking.rerank", { n: n("candidates") }), note: "", warn: false };
    case "compose":
      return { label: t(n("sources") === 1 ? "thinking.composeOne" : "thinking.compose", { n: n("sources") }), note: "", warn: false };
    case "abstain":
      return {
        label: t("thinking.abstain"),
        note: t("thinking.abstainDetail", { c: n("confidence").toFixed(2), t: n("threshold").toFixed(2) }),
        warn: true,
      };
    default:
      return { label: t("thinking.working"), note: "", warn: false };
  }
}

/**
 * The stages the API reported while answering. Open while the assistant works,
 * folded into a one-line summary once the answer starts.
 */
export function ThinkingSteps({
  stages,
  settled,
  seconds,
}: {
  stages: StreamStage[];
  settled: boolean;
  seconds: number | null;
}) {
  const { t, locale } = useI18n();
  if (stages.length === 0) return null;

  const warn = stages.some((s) => s.stage === "abstain");
  const state = !settled ? "active" : warn ? "warn" : "done";
  const summary = !settled
    ? t("thinking.active")
    : t(warn ? "thinking.warn" : "thinking.done", { s: (seconds ?? 0).toFixed(1) });

  return (
    <details className="thinking" data-state={state} open={!settled}>
      <summary>
        <span className="thinking__orb" aria-hidden />
        <span className="thinking__title">{summary}</span>
        <span className="thinking__chev" aria-hidden />
      </summary>
      <ol className="thinking__steps">
        {stages.map((stage, i) => {
          const { label, note, warn: isWarn } = describe(t, locale, stage);
          const last = i === stages.length - 1;
          const stepState = last && !settled ? "active" : isWarn ? "warn" : "done";
          return (
            <li key={i} data-state={stepState}>
              <span className="thinking__tick" aria-hidden />
              <span>
                {label}
                {note ? <small>{note}</small> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

export function TypingDots() {
  return (
    <span className="typing-dots" aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}
