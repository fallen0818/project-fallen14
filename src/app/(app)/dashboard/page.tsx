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

  const [budgets, requests, pos, charters, milestones, risks] = await Promise.all([
    supabase.from("capex_budgets").select("allocated_amount, committed_amount, spent_amount"),
    supabase.from("asset_requests").select("status"),
    supabase.from("purchase_orders").select("total"),
    supabase.from("project_charters").select("status"),
    supabase.from("milestones").select("physical_progress_percent"),
    supabase.from("risk_issue_log").select("status, severity"),
  ]);

  const budgetRows = budgets.data ?? [];
  const requestRows = requests.data ?? [];
  const poRows = pos.data ?? [];
  const charterRows = charters.data ?? [];
  const milestoneRows = milestones.data ?? [];
  const riskRows = risks.data ?? [];

  const allocated = sum(budgetRows, "allocated_amount");
  const committed = sum(budgetRows, "committed_amount");
  const poTotal = sum(poRows, "total");
  const openRisks = riskRows.filter((r) => !["resolved", "closed"].includes(String(r.status))).length;
  const avgProgress =
    milestoneRows.length > 0
      ? sum(milestoneRows, "physical_progress_percent") / milestoneRows.length
      : 0;

  return (
    <>
      <PageHeader breadcrumb="Operational Overview" title="Investment Control Center" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard accent="var(--primary)" label="Capex Allocated" value={formatCurrency(allocated)} hint={`${budgetRows.length} budgets`} />
        <StatCard accent="var(--secondary)" label="Committed" value={formatCurrency(committed)} hint={allocated > 0 ? `${((committed / allocated) * 100).toFixed(0)}% of allocation` : "—"} />
        <StatCard accent="var(--tertiary)" label="PO Value Issued" value={formatCurrency(poTotal)} hint={`${poRows.length} purchase orders`} />
        <StatCard accent="var(--success)" label="Active Projects" value={String(charterRows.filter((c) => c.status === "active").length)} hint={`${charterRows.length} total`} />
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
