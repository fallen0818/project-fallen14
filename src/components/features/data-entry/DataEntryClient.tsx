"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
} from "@/services/projects";
import {
  PROJECT_CATEGORIES,
  DEPARTMENTS,
  FUNDING_SOURCES,
  PROJECT_STATUSES,
} from "@/lib/constants";
import type {
  ProjectWithRelations,
  ProjectInput,
  UnitDistributionInput,
  ProjectStatus,
} from "@/types/database";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/constants";

const EMPTY_PROJECT: ProjectInput = {
  title: "",
  category: "",
  summary: "",
  initial_allocation: null,
  projected_roi: null,
  fiscal_commencement: null,
  implementing_department: "",
  status: "draft",
};

const EMPTY_UNIT: UnitDistributionInput = {
  engineering_heads: 0,
  design_ux_leads: 0,
  qa_count: 0,
  data_gov_count: 0,
};

export function DataEntryClient() {
  const supabase = createClient();
  const showToast = useToast();

  const [projects, setProjects] = useState<ProjectWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState<ProjectInput>(EMPTY_PROJECT);
  const [unit, setUnit] = useState<UnitDistributionInput>(EMPTY_UNIT);
  const [funding, setFunding] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      setProjects(await getProjects(supabase));
    } catch {
      showToast("Failed to load projects", "error");
    } finally {
      setLoading(false);
    }
  }, [supabase, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_PROJECT);
    setUnit(EMPTY_UNIT);
    setFunding([]);
  }

  function startEdit(p: ProjectWithRelations) {
    setEditingId(p.id);
    setForm({
      title: p.title,
      category: p.category ?? "",
      summary: p.summary ?? "",
      initial_allocation: p.initial_allocation,
      projected_roi: p.projected_roi,
      fiscal_commencement: p.fiscal_commencement,
      implementing_department: p.implementing_department ?? "",
      status: p.status,
    });
    setUnit(
      p.unit_distribution
        ? {
            engineering_heads: p.unit_distribution.engineering_heads,
            design_ux_leads: p.unit_distribution.design_ux_leads,
            qa_count: p.unit_distribution.qa_count,
            data_gov_count: p.unit_distribution.data_gov_count,
          }
        : EMPTY_UNIT,
    );
    setFunding(p.project_funding_sources.map((f) => f.source));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      showToast("Project title is required", "error");
      return;
    }
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (editingId) {
        await updateProject(supabase, editingId, form, unit, funding);
        showToast("Project updated", "success");
      } else {
        await createProject(supabase, user.id, form, unit, funding);
        showToast("Project created", "success");
      }
      resetForm();
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    try {
      await deleteProject(supabase, id);
      showToast("Project deleted", "info");
      if (editingId === id) resetForm();
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", "error");
    }
  }

  const toggleFunding = (source: string) =>
    setFunding((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source],
    );

  const numOrNull = (v: string) => (v === "" ? null : Number(v));

  return (
    <>
      <PageHeader breadcrumb="Data Management" title={editingId ? "Edit Project" : "New Project Entry"} />

      <form onSubmit={handleSubmit} className="card" style={{ marginBottom: "2rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.25rem" }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="field-label" htmlFor="title">Project Title *</label>
            <input id="title" className="input" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>

          <div>
            <label className="field-label" htmlFor="category">Category</label>
            <select id="category" className="select" value={form.category ?? ""}
              onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">Select category…</option>
              {PROJECT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="department">Implementing Department</label>
            <select id="department" className="select" value={form.implementing_department ?? ""}
              onChange={(e) => setForm({ ...form, implementing_department: e.target.value })}>
              <option value="">Select department…</option>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="allocation">Initial Allocation ($)</label>
            <input id="allocation" className="input" type="number" min="0" step="0.01"
              value={form.initial_allocation ?? ""}
              onChange={(e) => setForm({ ...form, initial_allocation: numOrNull(e.target.value) })} />
          </div>

          <div>
            <label className="field-label" htmlFor="roi">Projected ROI (%)</label>
            <input id="roi" className="input" type="number" step="0.01"
              value={form.projected_roi ?? ""}
              onChange={(e) => setForm({ ...form, projected_roi: numOrNull(e.target.value) })} />
          </div>

          <div>
            <label className="field-label" htmlFor="fiscal">Fiscal Commencement</label>
            <input id="fiscal" className="input" type="date"
              value={form.fiscal_commencement ?? ""}
              onChange={(e) => setForm({ ...form, fiscal_commencement: e.target.value || null })} />
          </div>

          <div>
            <label className="field-label" htmlFor="status">Status</label>
            <select id="status" className="select" value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
              {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label className="field-label" htmlFor="summary">Summary</label>
            <textarea id="summary" className="textarea" value={form.summary ?? ""}
              onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          </div>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid var(--outline-variant)", opacity: 0.5, margin: "1.5rem 0" }} />

        <p className="label-sm" style={{ marginBottom: "0.75rem" }}>Unit Distribution</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "1rem" }}>
          {([
            ["engineering_heads", "Engineering Heads"],
            ["design_ux_leads", "Design / UX Leads"],
            ["qa_count", "QA"],
            ["data_gov_count", "Data Governance"],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <label className="field-label" htmlFor={key}>{label}</label>
              <input id={key} className="input" type="number" min="0"
                value={unit[key]}
                onChange={(e) => setUnit({ ...unit, [key]: Number(e.target.value) || 0 })} />
            </div>
          ))}
        </div>

        <p className="label-sm" style={{ margin: "1.5rem 0 0.75rem" }}>Funding Sources</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {FUNDING_SOURCES.map((s) => (
            <button key={s} type="button" onClick={() => toggleFunding(s)}
              className={cn("badge", funding.includes(s) ? "badge-active" : "badge-draft")}
              style={{ cursor: "pointer", padding: "0.4rem 0.8rem", textTransform: "none", fontSize: "0.8rem" }}>
              {funding.includes(s) ? "✓ " : ""}{s}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.75rem" }}>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : editingId ? "Update Project" : "Create Project"}
          </Button>
          {editingId && (
            <Button type="button" variant="secondary" onClick={resetForm}>Cancel</Button>
          )}
        </div>
      </form>

      <PageHeader breadcrumb="Records" title="Existing Projects" />
      {loading ? (
        <p style={{ color: "var(--on-surface-variant)" }}>Loading…</p>
      ) : projects.length === 0 ? (
        <p style={{ color: "var(--on-surface-variant)" }}>No projects yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {projects.map((p) => (
            <div key={p.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <p style={{ fontWeight: 600, margin: 0 }}>{p.title}</p>
                  <Badge value={p.status} />
                </div>
                <p className="label-sm" style={{ margin: "0.3rem 0 0" }}>
                  {p.category ?? "Uncategorized"} · {p.implementing_department ?? "—"} · {formatCurrency(p.initial_allocation)} · {formatDate(p.fiscal_commencement)}
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button variant="secondary" onClick={() => startEdit(p)} style={{ padding: "0.45rem 0.9rem" }}>Edit</Button>
                <Button variant="danger" onClick={() => handleDelete(p.id)} style={{ padding: "0.45rem 0.9rem" }}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
