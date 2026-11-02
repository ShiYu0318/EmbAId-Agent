"use client";

import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Counts up to `value` once, with a strong ease-out; re-targets smoothly when it changes. */
export function NumberTicker({
  value,
  format,
  duration = 900,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
}) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  const from = useRef(shown);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      const next = origin + (value - origin) * eased;
      from.current = next;
      setShown(next);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <span className="ticker">{format(shown)}</span>;
}

/** A tiny trend line that draws itself in on mount. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const step = 100 / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(2)},${(28 - (v / max) * 24).toFixed(2)}`);
  const line = `M${points.join(" L")}`;
  return (
    <svg className="sparkline" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label={label}>
      <path className="sparkline__area" d={`${line} L100,30 L0,30 Z`} />
      <path className="sparkline__line" d={line} pathLength={1} />
    </svg>
  );
}
