import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Kind = "Requisition" | "RFQ" | "Purchase Order";

interface Activity {
  kind: Kind;
  code: string;
  title: string;
  start: string;
  end: string;
  status: string;
}

// Fixed mid-tone colors (bars carry white text, so they must read in both themes).
const KIND_COLOR: Record<Kind, string> = {
  Requisition: "#2f6bff",
  RFQ: "#d98a1f",
  "Purchase Order": "#2e9e5b",
};

/** Parse a YYYY-MM-DD string into {year, month(0-11)} without timezone drift. */
function parseYmd(s: string | null): { year: number; month: number } | null {
  if (!s) return null;
  const [y, m] = s.split("-").map(Number);
  if (!y || !m) return null;
  return { year: y, month: m - 1 };
}

export default async function SchedulePage() {
  const supabase = await createClient();
  const year = new Date().getFullYear();

  const [reqs, rfqs, pos] = await Promise.all([
    supabase.from("purchase_requisitions").select("code, title, requisition_date, required_by_date, status"),
    supabase.from("vendor_biddings").select("code, title, issue_date, close_date, status"),
    supabase.from("purchase_orders").select("code, vendor_name, order_date, expected_delivery_date, status"),
  ]);

  const activities: Activity[] = [
    ...(reqs.data ?? []).map((r) => ({
      kind: "Requisition" as const,
      code: String(r.code),
      title: String(r.title ?? "Requisition"),
      start: String(r.requisition_date),
      end: String(r.required_by_date ?? r.requisition_date),
      status: String(r.status),
    })),
    ...(rfqs.data ?? []).map((r) => ({
      kind: "RFQ" as const,
      code: String(r.code),
      title: String(r.title ?? "Request for Quotation"),
      start: String(r.issue_date),
      end: String(r.close_date ?? r.issue_date),
      status: String(r.status),
    })),
    ...(pos.data ?? []).map((r) => ({
      kind: "Purchase Order" as const,
      code: String(r.code),
      title: String(r.vendor_name ?? "Purchase Order"),
      start: String(r.order_date),
      end: String(r.expected_delivery_date ?? r.order_date),
      status: String(r.status),
    })),
  ];

  // Keep activities that overlap the target year, sorted by start date.
  const rows = activities
    .map((a) => {
      const s = parseYmd(a.start);
      const e = parseYmd(a.end) ?? s;
      if (!s || !e) return null;
      if (s.year > year || e.year < year) return null;
      const startMonth = s.year < year ? 0 : s.month;
      const endMonth = e.year > year ? 11 : Math.max(e.month, s.year < year ? 0 : s.month);
      return { ...a, startMonth, endMonth };
    })
    .filter((x): x is Activity & { startMonth: number; endMonth: number } => x !== null)
    .sort((a, b) => a.startMonth - b.startMonth || a.start.localeCompare(b.start));

  const gridTemplate = "minmax(200px, 240px) repeat(12, 1fr)";

  return (
    <>
      <PageHeader breadcrumb="Procurement" title={`Annual Procurement Schedule · ${year}`} />

      <div style={{ display: "flex", gap: "1.25rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {(Object.keys(KIND_COLOR) as Kind[]).map((k) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", color: "var(--on-surface-variant)" }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: KIND_COLOR[k] }} />
            {k}
          </span>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card" style={{ textAlign: "center", color: "var(--on-surface-variant)" }}>
          No procurement activity scheduled in {year}.
        </div>
      ) : (
        <div className="card" style={{ padding: "1rem", overflowX: "auto" }}>
          <div style={{ minWidth: 760 }}>
            {/* Month header */}
            <div style={{ display: "grid", gridTemplateColumns: gridTemplate, marginBottom: "0.5rem" }}>
              <div className="label-sm">Activity</div>
              {MONTHS.map((m) => (
                <div key={m} className="label-sm" style={{ textAlign: "center" }}>{m}</div>
              ))}
            </div>

            {/* Activity rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {rows.map((a, i) => (
                <div
                  key={`${a.code}-${i}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: gridTemplate,
                    alignItems: "center",
                    background: "var(--surface-container-low)",
                    borderRadius: "0.5rem",
                    padding: "0.35rem 0",
                    position: "relative",
                  }}
                >
                  <div style={{ padding: "0 0.75rem", overflow: "hidden" }}>
                    <div style={{ fontWeight: 600, fontSize: "0.82rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {a.code}
                    </div>
                    <div className="label-sm" style={{ textTransform: "none", letterSpacing: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {a.title}
                    </div>
                  </div>

                  {/* month gridlines */}
                  {MONTHS.map((m, mi) => (
                    <div key={m} style={{ gridColumn: `${mi + 2} / ${mi + 3}`, gridRow: 1, height: "100%", borderLeft: mi === 0 ? "none" : "1px dashed var(--outline-variant)", opacity: 0.4 }} />
                  ))}

                  {/* the schedule bar */}
                  <div
                    title={`${a.code} · ${formatDate(a.start)} → ${formatDate(a.end)}`}
                    style={{
                      gridColumn: `${a.startMonth + 2} / ${a.endMonth + 3}`,
                      gridRow: 1,
                      height: 22,
                      borderRadius: 999,
                      background: KIND_COLOR[a.kind],
                      display: "flex",
                      alignItems: "center",
                      padding: "0 0.6rem",
                      color: "#fff",
                      fontSize: "0.68rem",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      margin: "0 2px",
                    }}
                  >
                    {a.status.replace(/-/g, " ")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="label-sm" style={{ textTransform: "none", letterSpacing: 0, marginTop: "1rem", color: "var(--on-surface-variant)" }}>
        Requisitions span requisition → required-by; RFQs span issue → close; POs span order → expected delivery.
        Hover a bar to see exact dates.
      </p>
    </>
  );
}
