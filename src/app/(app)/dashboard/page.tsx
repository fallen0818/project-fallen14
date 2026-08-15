import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Cnt = Record<string, unknown>;
const sum = (rows: Cnt[], key: string) =>
  rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);
const groupBy = (rows: Cnt[], key: string) => {
  const m: Record<string, number> = {};
  for (const r of rows) {
    const k = String(r[key] ?? "unknown");
    m[k] = (m[k] ?? 0) + 1;
  }
  return m;
};

export default async function DashboardPage() {
  const supabase = await createClient();

  // status/severity moved to lookup_options-backed *_id foreign keys same as
  // everywhere else in this schema -- these queries embed the referenced
  // lookup row to get back a human label instead of selecting a plain
  // "status"/"severity" column that no longer exists (asset_requests and
  // risk_issue_log migrated in the Part 0 reconstruction; project_charters
  // and milestones just now, migration 0022 -- see SCHEMA_RESTRUCTURE.md).
  // Before this fix all three of these queries silently failed (the error
  // is swallowed by `.data ?? []`), so Asset Requests by Status, Active
  // Projects, Projects by Status, and Risks by Severity always showed 0/empty
  // regardless of actual data.
  const [budgets, requests, pos, charters, milestones, risks] = await Promise.all([
    supabase.from("capex_budgets").select("allocated_amount, committed_amount, spent_amount"),
    supabase.from("asset_requests").select("estimated_cost, status:lookup_options!status_id(value)"),
    supabase.from("purchase_orders").select("total"),
    supabase.from("project_charters").select("status:lookup_options!status_id(value)"),
    supabase.from("milestones").select("physical_progress_percent"),
    supabase.from("risk_issue_log").select("status:lookup_options!status_id(value), severity:lookup_options!severity_id(value)"),
  ]);

  type StatusJoin = { value: string } | null;

  const budgetRows = budgets.data ?? [];
  const requestRows = (requests.data ?? []).map((r) => ({
    estimated_cost: r.estimated_cost,
    status: (r.status as unknown as StatusJoin)?.value ?? "Unknown",
  }));
  const poRows = pos.data ?? [];
  const charterRows = (charters.data ?? []).map((r) => ({
    status: (r.status as unknown as StatusJoin)?.value ?? "Unknown",
  }));
  const milestoneRows = milestones.data ?? [];
  const riskRows = (risks.data ?? []).map((r) => ({
    status: (r.status as unknown as StatusJoin)?.value ?? "Unknown",
    severity: (r.severity as unknown as StatusJoin)?.value ?? "Unknown",
  }));

  const allocated = sum(budgetRows, "allocated_amount");
  // Committed now tracks real Asset Request asks instead of capex_budgets'
  // own hand-typed committed_amount column -- same "make the number reflect
  // actual linked data" fix as Estimated Cost auto-following its BOM total.
  // Draft isn't a commitment yet (not even submitted), and Rejected/
  // Cancelled are dead ends that were never going to spend -- everything
  // else (Submitted, Under Review, Approved, Procured) counts as committed
  // budget, whether or not it's been formally approved yet.
  const committedRequests = requestRows.filter((r) => !["Draft", "Rejected", "Cancelled"].includes(r.status));
  const committed = sum(committedRequests, "estimated_cost");
  const poTotal = sum(poRows, "total");
  const openRisks = riskRows.filter((r) => !["Resolved", "Closed"].includes(r.status)).length;
  const avgProgress =
    milestoneRows.length > 0
      ? sum(milestoneRows, "physical_progress_percent") / milestoneRows.length
      : 0;

  return (
    <>
      <PageHeader breadcrumb="Operational Overview" title="Investment Control Center" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard accent="var(--primary)" label="Capex Allocated" value={formatCurrency(allocated)} hint={`${budgetRows.length} budgets`} />
        <StatCard
          accent="var(--secondary)"
          label="Committed"
          value={formatCurrency(committed)}
          hint={`${committedRequests.length} active requests${allocated > 0 ? ` · ${((committed / allocated) * 100).toFixed(0)}% of allocation` : ""}`}
        />
        <StatCard accent="var(--tertiary)" label="PO Value Issued" value={formatCurrency(poTotal)} hint={`${poRows.length} purchase orders`} />
        <StatCard accent="var(--success)" label="Active Projects" value={String(charterRows.filter((c) => c.status === "Active").length)} hint={`${charterRows.length} total`} />
        <StatCard accent="var(--warning)" label="Avg Milestone Progress" value={`${avgProgress.toFixed(0)}%`} hint={`${milestoneRows.length} milestones`} />
        <StatCard accent="var(--error)" label="Open Risks/Issues" value={String(openRisks)} hint={`${riskRows.length} logged`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
        <Breakdown title="Asset Requests by Status" module="capex" entity="asset-requests" data={groupBy(requestRows, "status")} />
        <Breakdown title="Projects by Status" module="monitoring" entity="charters" data={groupBy(charterRows, "status")} />
        <Breakdown title="Risks by Severity" module="monitoring" entity="risks" data={groupBy(riskRows, "severity")} />
      </div>
    </>
  );
}

function Breakdown({
  title,
  module,
  entity,
  data,
}: {
  title: string;
  module: string;
  entity: string;
  data: Record<string, number>;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem" }}>
        <h3 className="font-headline" style={{ fontSize: "1.05rem" }}>{title}</h3>
        <Link href={`/${module}/${entity}`} style={{ fontSize: "0.8rem", color: "var(--primary)", fontWeight: 600 }}>View →</Link>
      </div>
      {entries.length === 0 ? (
        <p style={{ color: "var(--on-surface-variant)", fontSize: "0.9rem" }}>No data yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
          {entries.map(([label, count]) => (
            <div key={label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
                <span style={{ textTransform: "capitalize", color: "var(--on-surface-variant)" }}>{label.replace(/-/g, " ")}</span>
                <span style={{ fontWeight: 600 }}>{count}</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${(count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
