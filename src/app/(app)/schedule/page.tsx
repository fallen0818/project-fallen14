import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Kind = "Requisition" | "Purchase Order" | "Procurement Item" | "Procurement Activity";

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
  "Purchase Order": "#2e9e5b",
  "Procurement Item": "#8b5cf6",
  "Procurement Activity": "#0d9488",
};

/** Parse a YYYY-MM-DD (or ISO timestamp) string into {year, month(0-11)} without timezone drift. */
function parseYmd(s: string | null): { year: number; month: number } | null {
  if (!s) return null;
  const [y, m] = s.split("-").map(Number);
  if (!y || !m) return null;
  return { year: y, month: m - 1 };
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const supabase = await createClient();

  // Year is a query param (?year=2027) rather than always "now" so the plan
  // is browsable across years, not locked to the current one. Falls back to
  // the current year on anything unparseable.
  const thisYear = new Date().getFullYear();
  const { year: yearParam } = await searchParams;
  const parsedYear = Number(yearParam);
  const year = Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2999 ? parsedYear : thisYear;
  const prevYear = year - 1;
  const nextYear = year + 1;
  // Jump-to menu: five years back through five years ahead of *today*
  // (not the currently-viewed year), so the range doesn't creep as you page
  // through years.
  const yearOptions = Array.from({ length: 11 }, (_, i) => thisYear - 5 + i);

  // Status moved to lookup_options-backed *_id foreign keys (migrations
  // 0008-0011), and purchase_orders.vendor_name was dropped in favor of
  // vendor_id/contractor_id (migration 0014/0016) -- these queries embed the
  // referenced tables to get back a human label instead of selecting columns
  // that no longer exist. Each table here has only one FK into
  // lookup_options, so the embed is unambiguous without a `!column` hint.
  //
  // The old standalone "RFQ" row (vendor_biddings) and "Bidding Activity"
  // row (bidding_schedule_activities) are gone -- that whole module was
  // retired in favor of Procurement Activities (migration 0041), whose own
  // schedule steps (procurement_activity_lines, migration 0043) are what
  // "Procurement Activity" below reads from now -- same single-planned-date
  // marker behavior the old Bidding Activity row had, just from its
  // successor table.
  const [reqs, pos, items, pqActivities] = await Promise.all([
    // Title, Requisition Date, and Required By were all dropped from
    // purchase_requisitions -- a Requisition is now trimmed down to just
    // being the approval record (migration 0049): who's asking, the
    // decision, and the decision trail. Requested By + Department is the
    // closest thing left to a human-readable label; with no date range of
    // its own anymore, it shows as a single-day marker (Approved Date once
    // set, else when it was raised) rather than a bar, same idea as a
    // Procurement Activity's schedule steps below.
    supabase
      .from("purchase_requisitions")
      .select("code, requested_by, department, created_at, approved_date, status:lookup_options(value)"),
    supabase
      .from("purchase_orders")
      .select("code, order_date, expected_delivery_date, status:lookup_options(value), vendor:vendors(name), contractor:contractors(name)"),
    // procurement_items dropped its own Description column (migration 0038)
    // -- its linked Asset Request's Title is the closest thing it still has
    // to a human-readable name, same fallback used in Bid Evaluation's own
    // "Subject" line.
    supabase
      .from("procurement_items")
      .select("code, created_at, status:lookup_options(value), asset_request:asset_requests(title, required_by_date)"),
    // Procurement Activity schedule steps (Pre-bid Conference, Opening of
    // Bids, ...) show up here one row per step, as soon as they're saved on
    // the Procurement Activity's own Activity Schedule line list.
    supabase
      .from("procurement_activity_lines")
      .select("activity, activity_date, status:lookup_options(value), procurement_activity:procurement_activities(code)"),
  ]);

  type StatusJoin = { value: string } | null;

  const activities: Activity[] = [
    ...(reqs.data ?? []).map((r) => {
      const day = String(r.approved_date ?? r.created_at).slice(0, 10);
      return {
        kind: "Requisition" as const,
        code: String(r.code),
        title: r.requested_by ? `${r.requested_by}${r.department ? ` (${r.department})` : ""}` : "Requisition",
        start: day,
        end: day,
        status: (r.status as unknown as StatusJoin)?.value ?? "—",
      };
    }),
    ...(pos.data ?? []).map((r) => ({
      kind: "Purchase Order" as const,
      code: String(r.code),
      title: String((r.vendor as unknown as { name: string } | null)?.name ?? (r.contractor as unknown as { name: string } | null)?.name ?? "Purchase Order"),
      start: String(r.order_date),
      end: String(r.expected_delivery_date ?? r.order_date),
      status: (r.status as unknown as StatusJoin)?.value ?? "—",
    })),
    // Procurement items have no planned-date pair of their own: the bar spans
    // from when the item was identified (created_at) to when its parent
    // asset request needs it (required_by_date) -- the same "identified →
    // needed by" window the Capex Plan already tracks, so the schedule shows
    // how much runway procurement actually has to source and order it.
    ...(items.data ?? []).map((r) => {
      const assetRequest = r.asset_request as unknown as { title: string | null; required_by_date: string | null } | null;
      return {
        kind: "Procurement Item" as const,
        code: String(r.code),
        title: String(assetRequest?.title ?? "Procurement Item"),
        start: String(r.created_at).slice(0, 10),
        end: String(assetRequest?.required_by_date ?? String(r.created_at).slice(0, 10)),
        status: (r.status as unknown as StatusJoin)?.value ?? "—",
      };
    }),
    // Each schedule step is a single planned date, not a range -- it renders
    // as a one-month-wide marker (start === end) on whichever month that
    // date falls in.
    ...(pqActivities.data ?? []).map((r) => ({
      kind: "Procurement Activity" as const,
      code: String((r.procurement_activity as unknown as { code: string } | null)?.code ?? "—"),
      title: String(r.activity ?? "Procurement Activity"),
      start: String(r.activity_date),
      end: String(r.activity_date),
      status: (r.status as unknown as StatusJoin)?.value ?? "—",
    })),
  ];

  // Keep activities that overlap the target year, sorted by start date.
  const rows = activities
    .map((a) => {
      const s = parseYmd(a.start);
      let e = parseYmd(a.end) ?? s;
      if (!s || !e) return null;
      // A required-by date earlier than the identified date (or any other
      // out-of-order pair) would otherwise flip the bar backwards.
      if (e.year < s.year || (e.year === s.year && e.month < s.month)) e = s;
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
      <PageHeader
        breadcrumb="Procurement"
        title={`Annual Procurement Schedule · ${year}`}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Link href={`/schedule?year=${prevYear}`} className="btn btn-secondary" style={{ padding: "0.5rem 0.85rem" }}>
              ‹ {prevYear}
            </Link>
            <form action="/schedule" style={{ display: "flex", gap: "0.4rem" }}>
              <select name="year" defaultValue={year} className="select" style={{ width: "auto" }}>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button type="submit" className="btn btn-secondary">Go</button>
            </form>
            <Link href={`/schedule?year=${nextYear}`} className="btn btn-secondary" style={{ padding: "0.5rem 0.85rem" }}>
              {nextYear} ›
            </Link>
          </div>
        }
      />

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
                    {a.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="label-sm" style={{ textTransform: "none", letterSpacing: 0, marginTop: "1rem", color: "var(--on-surface-variant)" }}>
        Requisitions mark a single date (Approved Date once set, else when raised); POs span order → expected delivery;
        Procurement Items span identified (created) → the linked asset request&apos;s required-by date;
        Procurement Activities mark a single planned date (Pre-bid Conference, Opening of Bids, etc. — added from a Procurement Activity&apos;s own Activity Schedule).
        Hover a bar to see exact dates.
      </p>
    </>
  );
}
