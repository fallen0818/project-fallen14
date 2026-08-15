import type { CSSProperties } from "react";

/**
 * The .stat-value CSS class caps out around 2rem with `white-space: nowrap`
 * inside a card that clips overflow -- fine for short figures like "42%",
 * but a 10-digit currency amount ("₱1,234,567,890") at that size runs past
 * a ~230px card and gets silently clipped by `overflow: hidden`. Shrink the
 * cap based on the formatted string's length so long figures stay fully
 * visible instead of cut off; short values keep the original, more
 * prominent size.
 */
function fitFontSize(value: string): string {
  const len = value.length;
  const max = len <= 6 ? 2 : len <= 9 ? 1.65 : len <= 12 ? 1.35 : len <= 16 ? 1.1 : 0.95;
  const min = Math.min(1.1, max);
  return `clamp(${min}rem, 2.2vw, ${max}rem)`;
}

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  /** CSS color for the top accent + value (e.g. "var(--secondary)"). */
  accent?: string;
}) {
  const style = accent ? ({ "--stat-accent": accent } as CSSProperties) : undefined;
  return (
    <div className="card stat-card" style={style}>
      <p className="label-sm" style={{ margin: 0 }}>{label}</p>
      <p className="stat-value" style={{ fontSize: fitFontSize(value) }} title={value}>{value}</p>
      {hint && (
        <p style={{ fontSize: "0.8rem", color: "var(--on-surface-variant)", margin: "0.45rem 0 0" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
