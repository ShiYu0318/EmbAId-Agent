"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useI18n } from "@/lib/i18n";

export interface Command {
  id: string;
  label: string;
  group: string;
  keywords?: string;
  icon?: ReactNode;
  hint?: string;
  run: () => void;
}

function matches(command: Command, query: string): boolean {
  if (!query) return true;
  const haystack = `${command.label} ${command.keywords ?? ""} ${command.group}`.toLowerCase();
  // Every typed character must appear in order — forgiving enough for "kb" → "knowledge base".
  let from = 0;
  for (const ch of query.toLowerCase().replace(/\s+/g, "")) {
    from = haystack.indexOf(ch, from);
    if (from === -1) return false;
    from += 1;
  }
  return true;
}

/** ⌘K / Ctrl+K launcher for pages, actions and projects. */
export function CommandPalette({
  commands,
  open,
  onOpenChange,
}: {
  commands: Command[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState<{ y: number; h: number } | null>(null);

  const results = useMemo(() => commands.filter((c) => matches(c, query.trim())), [commands, query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => setActive(0), [query]);

  // Glide one highlight between rows instead of repainting each row's background.
  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!row) {
      setHighlight(null);
      return;
    }
    setHighlight({ y: row.offsetTop, h: row.offsetHeight });
    row.scrollIntoView({ block: "nearest" });
  }, [active, results, open]);

  const run = useCallback(
    (command: Command | undefined) => {
      if (!command) return;
      onOpenChange(false);
      command.run();
    },
    [onOpenChange],
  );

  if (!open) return null;

  let index = -1;
  const groups = results.reduce<Record<string, Command[]>>((acc, c) => {
    (acc[c.group] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="palette" role="presentation" onMouseDown={() => onOpenChange(false)}>
      <div
        className="palette__panel"
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.label")}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onOpenChange(false);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((i) => (results.length ? (i + 1) % results.length : 0));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
          } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            run(results[active]);
          }
        }}
      >
        <div className="palette__search">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("palette.placeholder")}
            aria-label={t("palette.placeholder")}
            aria-controls="palette-list"
            aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
          />
          <kbd>esc</kbd>
        </div>

        <div className="palette__list" id="palette-list" role="listbox" ref={listRef}>
          {highlight ? (
            <span
              className="palette__highlight"
              style={{ transform: `translateY(${highlight.y}px)`, height: highlight.h }}
              aria-hidden
            />
          ) : null}
          {results.length === 0 ? <p className="palette__empty">{t("palette.empty")}</p> : null}
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} className="palette__group" role="group" aria-label={group}>
              <span className="palette__heading">{group}</span>
              {items.map((command) => {
                index += 1;
                const i = index;
                return (
                  <div
                    key={command.id}
                    id={`palette-${command.id}`}
                    role="option"
                    aria-selected={i === active}
                    data-index={i}
                    className={i === active ? "palette__item is-active" : "palette__item"}
                    onMouseMove={() => setActive(i)}
                    onClick={() => run(command)}
                  >
                    <span className="palette__icon">{command.icon}</span>
                    <span className="palette__label">{command.label}</span>
                    {command.hint ? <span className="palette__hint">{command.hint}</span> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="palette__foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {t("palette.move")}
          </span>
          <span>
            <kbd>↵</kbd> {t("palette.select")}
          </span>
        </div>
      </div>
    </div>
  );
}
