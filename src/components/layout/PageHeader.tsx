import type { ReactNode } from "react";

export function PageHeader({
  breadcrumb,
  title,
  actions,
}: {
  breadcrumb: string;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: "1rem",
        marginBottom: "2rem",
        flexWrap: "wrap",
      }}
    >
      <div>
        <p className="label-sm" style={{ margin: 0 }}>{breadcrumb}</p>
        <h2 className="font-headline" style={{ fontSize: "1.75rem", marginTop: "0.25rem" }}>
          {title}
        </h2>
      </div>
      {actions && <div style={{ display: "flex", gap: "0.75rem" }}>{actions}</div>}
    </div>
  );
}
