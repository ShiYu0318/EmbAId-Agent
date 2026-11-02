"use client";

import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from "react";

import styles from "./viz.module.css";

/* ---------- shared ---------- */

export interface Series {
  key: string;
  label: string;
  colorVar: string;
  values: number[];
}

function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Clean axis ticks: 0 and a 1/2/5 × 10^n step that covers `max` in about four steps. */
export function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

function compact(n: number): string {
  if (Math.abs(n) >= 10000) return `${Math.round(n / 1000)}K`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(n * 100) / 100);
}

function shortDate(iso: string, locale: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).format(d);
}

export function Legend({ items, shape = "line" }: { items: { label: string; colorVar: string }[]; shape?: "line" | "rect" }) {
  return (
    <ul className={styles.legend}>
      {items.map((item) => (
        <li key={item.label}>
          <span className={shape === "line" ? styles.keyLine : styles.keyRect} style={{ background: `var(${item.colorVar})` }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Every chart's data, reachable without hovering. */
export function DataTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: ReactNode[][] }) {
  return (
    <details className={styles.tableToggle}>
      <summary>{caption}</summary>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/* ---------- time series (line + area wash, crosshair tooltip) ---------- */

const PAD = { top: 14, right: 14, bottom: 26, left: 40 };

export function TimeSeries({
  dates,
  series,
  locale,
  height = 240,
  ariaLabel,
}: {
  dates: string[];
  series: Series[];
  locale: string;
  height?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();
  const n = dates.length;
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 64))));

  const path = (values: number[]) => values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left - PAD.left;
    setHover(Math.max(0, Math.min(n - 1, Math.round((px / Math.max(1, innerW)) * (n - 1)))));
  };

  return (
    <div className={styles.chart} ref={ref}>
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          className={styles.svg}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
            if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n) - 1));
          }}
          onBlur={() => setHover(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={PAD.left} y={0} width={innerW} height={height} />
            </clipPath>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line className={styles.grid} x1={PAD.left} x2={PAD.left + innerW} y1={y(t)} y2={y(t)} />
              <text className={styles.tick} x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {compact(t)}
              </text>
            </g>
          ))}
          {dates.map((d, i) =>
            i % labelEvery === 0 || i === n - 1 ? (
              <text key={d} className={styles.tick} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
                {shortDate(d, locale)}
              </text>
            ) : null,
          )}
          <g clipPath={`url(#${clipId})`}>
            {series.map((s) => (
              <path
                key={`${s.key}-area`}
                className={styles.area}
                d={`${path(s.values)} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`}
                style={{ fill: `var(${s.colorVar})` }}
              />
            ))}
            {series.map((s) => (
              <path key={s.key} className={styles.line} d={path(s.values)} pathLength={1} style={{ stroke: `var(${s.colorVar})` }} />
            ))}
          </g>
          {hover === null
            ? series.map((s) => (
                <circle key={`${s.key}-end`} className={styles.dot} cx={x(n - 1)} cy={y(s.values[n - 1] ?? 0)} r={4} style={{ fill: `var(${s.colorVar})` }} />
              ))
            : null}
          {hover !== null ? (
            <g>
              <line className={styles.crosshair} x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} />
              {series.map((s) => (
                <circle key={s.key} className={styles.dot} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4} style={{ fill: `var(${s.colorVar})` }} />
              ))}
            </g>
          ) : null}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
      {hover !== null && width > 0 ? (
        <div
          className={styles.tooltip}
          style={{ left: Math.min(Math.max(x(hover), 80), width - 80), top: PAD.top }}
          role="status"
        >
          <div className={styles.tipDate}>{shortDate(dates[hover] ?? "", locale)}</div>
          {series.map((s) => (
            <div key={s.key} className={styles.tipRow}>
              <span className={styles.keyLine} style={{ background: `var(${s.colorVar})` }} />
              <b>{(s.values[hover] ?? 0).toLocaleString(locale)}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      ) : null}
      {series.length > 1 ? <Legend items={series} /> : null}
    </div>
  );
}

/* ---------- stacked columns (2px surface gaps, 4px rounded top) ---------- */

export function StackedColumns({
  dates,
  series,
  locale,
  height = 220,
  ariaLabel,
}: {
  dates: string[];
  series: Series[];
  locale: string;
  height?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = dates.length;
  const totals = dates.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const ticks = niceTicks(Math.max(0, ...totals));
  const top = ticks[ticks.length - 1] || 1;
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const band = innerW / Math.max(1, n);
  const bar = Math.max(2, Math.min(24, band * 0.62));
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 64))));
  const GAP = 2;

  return (
    <div className={styles.chart} ref={ref}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className={styles.svg} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className={styles.grid} x1={PAD.left} x2={PAD.left + innerW} y1={y(t)} y2={y(t)} />
              <text className={styles.tick} x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {compact(t)}
              </text>
            </g>
          ))}
          {dates.map((d, i) => {
            const cx = PAD.left + band * i + band / 2;
            let acc = 0;
            const segs = series
              .map((s) => ({ s, v: s.values[i] ?? 0 }))
              .filter((seg) => seg.v > 0);
            return (
              <g
                key={d}
                className={styles.column}
                style={{ animationDelay: `${Math.min(i * 10, 400)}ms` }}
                onPointerEnter={() => setHover(i)}
                data-active={hover === i || undefined}
              >
                <rect className={styles.hit} x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} />
                {segs.map(({ s, v }, k) => {
                  const y0 = y(acc);
                  acc += v;
                  const y1 = y(acc);
                  const h = Math.max(0, y0 - y1 - (k > 0 ? GAP : 0));
                  const last = k === segs.length - 1;
                  const r = last ? Math.min(4, bar / 2, h) : 0;
                  const top1 = y1;
                  const left = cx - bar / 2;
                  const d = last
                    ? `M${left},${top1 + h} V${top1 + r} Q${left},${top1} ${left + r},${top1} H${left + bar - r} Q${left + bar},${top1} ${left + bar},${top1 + r} V${top1 + h} Z`
                    : `M${left},${top1} H${left + bar} V${top1 + h} H${left} Z`;
                  return <path key={s.key} d={d} style={{ fill: `var(${s.colorVar})` }} />;
                })}
                {i % labelEvery === 0 || i === n - 1 ? (
                  <text className={styles.tick} x={cx} y={height - 6} textAnchor="middle">
                    {shortDate(d, locale)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
      {hover !== null && width > 0 ? (
        <div
          className={styles.tooltip}
          style={{ left: Math.min(Math.max(PAD.left + band * hover + band / 2, 80), width - 80), top: PAD.top }}
          role="status"
        >
          <div className={styles.tipDate}>{shortDate(dates[hover] ?? "", locale)}</div>
          {series.map((s) => (
            <div key={s.key} className={styles.tipRow}>
              <span className={styles.keyLine} style={{ background: `var(${s.colorVar})` }} />
              <b>{(s.values[hover] ?? 0).toLocaleString(locale)}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      ) : null}
      <Legend items={series} shape="rect" />
    </div>
  );
}

/* ---------- histogram with a threshold marker ---------- */

export function Histogram({
  counts,
  threshold,
  ariaLabel,
  labels,
  height = 200,
}: {
  counts: number[];
  threshold: number;
  ariaLabel: string;
  labels: { below: string; above: string; threshold: string; count: string };
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = counts.length;
  const ticks = niceTicks(Math.max(0, ...counts));
  const top = ticks[ticks.length - 1] || 1;
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const band = innerW / Math.max(1, n);
  const bar = Math.max(2, Math.min(24, band - 2));
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const tx = PAD.left + threshold * innerW;

  return (
    <div className={styles.chart} ref={ref}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className={styles.svg} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className={styles.grid} x1={PAD.left} x2={PAD.left + innerW} y1={y(t)} y2={y(t)} />
              <text className={styles.tick} x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {compact(t)}
              </text>
            </g>
          ))}
          {counts.map((c, i) => {
            const cx = PAD.left + band * i + band / 2;
            const h = Math.max(0, y(0) - y(c));
            const r = Math.min(4, bar / 2, h);
            const left = cx - bar / 2;
            const t = y(c);
            const below = (i + 1) / n <= threshold + 1e-9;
            return (
              <g key={i} className={styles.column} style={{ animationDelay: `${i * 30}ms` }} onPointerEnter={() => setHover(i)} data-active={hover === i || undefined}>
                <rect className={styles.hit} x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} />
                {h > 0 ? (
                  <path
                    d={`M${left},${t + h} V${t + r} Q${left},${t} ${left + r},${t} H${left + bar - r} Q${left + bar},${t} ${left + bar},${t + r} V${t + h} Z`}
                    style={{ fill: below ? "var(--warning)" : "var(--chart-1)" }}
                  />
                ) : null}
                {i % 2 === 0 ? (
                  <text className={styles.tick} x={PAD.left + band * i} y={height - 6} textAnchor="middle">
                    {(i / n).toFixed(1)}
                  </text>
                ) : null}
              </g>
            );
          })}
          <text className={styles.tick} x={PAD.left + innerW} y={height - 6} textAnchor="end">
            1.0
          </text>
          <line className={styles.marker} x1={tx} x2={tx} y1={PAD.top - 4} y2={PAD.top + innerH} />
          <text className={styles.markerLabel} x={tx + 6} y={PAD.top + 6}>
            {labels.threshold} {threshold.toFixed(2)}
          </text>
        </svg>
      ) : (
        <div style={{ height }} />
      )}
      {hover !== null && width > 0 ? (
        <div className={styles.tooltip} style={{ left: Math.min(Math.max(PAD.left + band * hover + band / 2, 80), width - 80), top: PAD.top }} role="status">
          <div className={styles.tipDate}>
            {(hover / n).toFixed(1)}–{((hover + 1) / n).toFixed(1)}
          </div>
          <div className={styles.tipRow}>
            <b>{counts[hover]}</b>
            <span>{labels.count}</span>
          </div>
        </div>
      ) : null}
      <Legend
        shape="rect"
        items={[
          { label: labels.above, colorVar: "--chart-1" },
          { label: labels.below, colorVar: "--warning" },
        ]}
      />
    </div>
  );
}

/* ---------- segmented bar (one whole, split into parts) ---------- */

export function SegmentBar({ items, locale }: { items: { label: string; value: number; colorVar: string }[]; locale: string }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  return (
    <div className={styles.segment}>
      <div className={styles.segmentTrack}>
        {items
          .filter((i) => i.value > 0)
          .map((item) => (
            <span
              key={item.label}
              className={styles.segmentPart}
              style={{ flexGrow: item.value, background: `var(${item.colorVar})` }}
              title={`${item.label} ${item.value}`}
            />
          ))}
      </div>
      <ul className={styles.segmentLegend}>
        {items.map((item) => (
          <li key={item.label}>
            <span className={styles.keyRect} style={{ background: `var(${item.colorVar})` }} />
            <span>{item.label}</span>
            <b>{item.value.toLocaleString(locale)}</b>
            <em>{Math.round((item.value / total) * 100)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- stat tile with a delta ---------- */

export function Delta({
  current,
  previous,
  upIsGood = true,
  label,
  points = false,
  emptyLabel = "—",
}: {
  current: number | null;
  previous: number | null;
  upIsGood?: boolean;
  label: string;
  /** Shown when there is no previous value to compare against. */
  emptyLabel?: string;
  /** Show the change in percentage points (for rates) instead of relative percent. */
  points?: boolean;
}) {
  // A relative change from zero is meaningless, so say there is nothing to compare.
  if (current === null || previous === null || (!points && previous === 0)) {
    return <span className={styles.deltaNone}>{emptyLabel}</span>;
  }
  const diff = points ? (current - previous) * 100 : ((current - previous) / previous) * 100;
  const rounded = Math.round(diff * 10) / 10;
  const tone = rounded === 0 ? "flat" : (rounded > 0) === upIsGood ? "good" : "bad";
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "±";
  return (
    <span className={styles.delta} data-tone={tone}>
      <span aria-hidden>{rounded > 0 ? "↑" : rounded < 0 ? "↓" : "→"}</span>
      {sign}
      {Math.abs(rounded)}
      {points ? " pp" : "%"}
      <em>{label}</em>
    </span>
  );
}
