import type { CSSProperties } from "react";

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
      <p className="stat-value" title={value}>{value}</p>
      {hint && (
        <p style={{ fontSize: "0.8rem", color: "var(--on-surface-variant)", margin: "0.45rem 0 0" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
