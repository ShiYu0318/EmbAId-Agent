"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import styles from "./charts.module.css";

const VIEW_W = 100;

function buildLine(values: number[], height: number, pad: number, max: number): { line: string; area: string } {
  const n = values.length;
  if (n === 0) return { line: "", area: "" };
  const innerH = height - pad * 2;
  const points = values.map((value, index) => {
    const x = n === 1 ? VIEW_W / 2 : (index / (n - 1)) * VIEW_W;
    const y = pad + innerH - (max <= 0 ? 0 : (value / max) * innerH);
    return [x, y] as const;
  });
  const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const area = first && last ? `${line} L${last[0].toFixed(2)},${height} L${first[0].toFixed(2)},${height} Z` : "";
  return { line, area };
}

export function AreaChart({
  values,
  labels,
  height = 150,
  colorVar = "--chart-1",
  ariaLabel,
}: {
  values: number[];
  labels: string[];
  height?: number;
  colorVar?: string;
  ariaLabel: string;
}) {
  const gradientId = useId();
  const max = Math.max(1, ...values);
  const pad = 6;
  const { line, area } = buildLine(values, height, pad, max);
  const color = `var(${colorVar})`;
  const gridYs = [pad, height / 2, height - pad];
  const startLabel = labels[0] ?? "";
  const midLabel = labels[Math.floor(labels.length / 2)] ?? "";
  const endLabel = labels[labels.length - 1] ?? "";

  return (
    <div className={styles.chart}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${VIEW_W} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        style={{ height }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {gridYs.map((y) => (
          <line
            key={y}
            x1="0"
            x2={VIEW_W}
            y1={y}
            y2={y}
            stroke="var(--chart-grid)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {area ? <path d={area} fill={`url(#${gradientId})`} /> : null}
        {line ? (
          <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        ) : null}
      </svg>
      <div className={styles.axisLabels}>
        <span>{startLabel}</span>
        <span>{midLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}

export function ChartHeadline({ value, caption }: { value: ReactNode; caption?: ReactNode }) {
  return (
    <div className={styles.chartTop}>
      <span className={styles.chartValue}>{value}</span>
      {caption ? <span className={styles.chartCaption}>{caption}</span> : null}
    </div>
  );
}

export interface HBarItem {
  label: string;
  value: number;
  valueLabel: string;
  colorVar?: string;
}

export function HBarList({ items }: { items: HBarItem[] }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className={styles.hbarList}>
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className={styles.hbarRow}>
          <div className={styles.hbarHead}>
            <span className={styles.hbarLabel} title={item.label}>
              {item.label}
            </span>
            <span className={styles.hbarValue}>{item.valueLabel}</span>
          </div>
          <div className={styles.hbarTrack}>
            <div
              className={styles.hbarFill}
              style={{ width: `${(item.value / max) * 100}%`, background: `var(${item.colorVar ?? "--chart-1"})` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Donut({
  value,
  label,
  colorVar = "--chart-1",
  size = 108,
}: {
  value: number;
  label: string;
  colorVar?: string;
  size?: number;
}) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));
  const dash = circumference * clamped;

  return (
    <div className={styles.donutWrap}>
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={label}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--surface-3)" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={`var(${colorVar})`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform="rotate(-90 50 50)"
        />
        <text x="50" y="50" dominantBaseline="central" textAnchor="middle" className={styles.donutCenter}>
          {`${Math.round(clamped * 100)}%`}
        </text>
      </svg>
    </div>
  );
}

export function GroupedBars({
  labels,
  seriesA,
  seriesB,
  height = 150,
  colorAVar = "--chart-1",
  colorBVar = "--chart-4",
  ariaLabel,
}: {
  labels: string[];
  seriesA: number[];
  seriesB: number[];
  height?: number;
  colorAVar?: string;
  colorBVar?: string;
  ariaLabel: string;
}) {
  const max = Math.max(1, ...seriesA, ...seriesB);
  const n = Math.max(seriesA.length, seriesB.length);
  const pad = 4;
  const innerH = height - pad;
  const slot = VIEW_W / Math.max(1, n);
  const barW = slot * 0.32;
  const gap = slot * 0.08;

  return (
    <div className={styles.chart}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${VIEW_W} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        style={{ height }}
      >
        {Array.from({ length: n }).map((_, index) => {
          const a = seriesA[index] ?? 0;
          const b = seriesB[index] ?? 0;
          const ha = (a / max) * innerH;
          const hb = (b / max) * innerH;
          const x0 = index * slot + slot / 2;
          return (
            <g key={index}>
              <rect
                x={x0 - barW - gap / 2}
                y={height - ha}
                width={barW}
                height={ha}
                rx="0.6"
                fill={`var(${colorAVar})`}
              />
              <rect x={x0 + gap / 2} y={height - hb} width={barW} height={hb} rx="0.6" fill={`var(${colorBVar})`} />
            </g>
          );
        })}
      </svg>
      <div className={styles.axisLabels}>
        <span>{labels[0] ?? ""}</span>
        <span>{labels[labels.length - 1] ?? ""}</span>
      </div>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; colorVar: string }[] }) {
  return (
    <div className={styles.legend}>
      {items.map((item) => (
        <span key={item.label} className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ background: `var(${item.colorVar})` }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
