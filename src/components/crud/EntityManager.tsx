"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  listRows,
  referenceOptions,
  createRow,
  updateRow,
  deleteRow,
  type Row,
} from "@/lib/crud/service";
import type { FieldDef } from "@/lib/crud/types";
import { ENTITIES_BY_KEY } from "@/lib/crud/configs";
import { validateValues } from "@/lib/crud/validation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";

type RefMap = Record<string, Row[]>;

export function EntityManager({ entityKey }: { entityKey: string }) {
  const config = ENTITIES_BY_KEY[entityKey];
  const supabase = useMemo(() => createClient(), []);
  const showToast = useToast();

  const [rows, setRows] = useState<Row[]>([]);
  const [refs, setRefs] = useState<RefMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});

  const referenceFields = useMemo(
    () => config.fields.filter((f) => f.type === "reference" && f.refTable),
    [config],
  );

  const load = useCallback(async () => {
    try {
      const [data, refEntries] = await Promise.all([
        listRows(supabase, config),
        Promise.all(
          referenceFields.map(async (f) => [
            f.refTable as string,
            await referenceOptions(supabase, f.refTable as string),
          ] as const),
        ),
      ]);
      setRows(data);
      setRefs(Object.fromEntries(refEntries));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load", "error");
    } finally {
      setLoading(false);
    }
  }, [supabase, config, referenceFields, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(defaults(config.fields));
    setModalOpen(true);
  }

  function openEdit(row: Row) {
    setEditing(row);
    const f: Record<string, unknown> = {};
    for (const field of config.fields) {
      if (field.readOnly) continue;
      f[field.name] = row[field.name] ?? "";
    }
    setForm(f);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const errors = validateValues(config.fields, form);
    if (errors.length > 0) {
      showToast(errors[0], "error");
      return;
    }
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (editing) {
        await updateRow(supabase, config, editing.id, form);
        showToast(`${config.singular} updated`, "success");
      } else {
        await createRow(supabase, config, form, user.id);
        showToast(`${config.singular} created`, "success");
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      console.error(`[${config.table}] save failed:`, JSON.stringify(err, null, 2));
      showToast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: Row) {
    if (!confirm(`Delete ${row.code ?? config.singular}? This cannot be undone.`)) return;
    try {
      await deleteRow(supabase, config, row.id);
      showToast(`${config.singular} deleted`, "info");
      await load();
    } catch (err) {
      console.error(`[${config.table}] delete failed`, err);
      showToast(errorMessage(err), "error");
    }
  }

  const listFields = config.fields.filter((f) => f.inList);

  return (
    <>
      <PageHeader
        breadcrumb={config.breadcrumb}
        title={config.plural}
        actions={<Button onClick={openCreate}>+ New {config.singular}</Button>}
      />

      {loading ? (
        <p style={{ color: "var(--on-surface-variant)" }}>Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card" style={{ textAlign: "center", color: "var(--on-surface-variant)" }}>
          No {config.plural.toLowerCase()} yet. Create the first one.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr>
                <Th>Code</Th>
                {listFields.map((f) => <Th key={f.name}>{f.label}</Th>)}
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} style={{ borderTop: "1px solid var(--surface-container-high)" }}>
                  <Td><span style={{ fontWeight: 600 }}>{String(row.code ?? "—")}</span></Td>
                  {listFields.map((f) => (
                    <Td key={f.name}>{renderCell(f, row, refs)}</Td>
                  ))}
                  <Td align="right">
                    <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                      <Button variant="secondary" onClick={() => openEdit(row)} style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}>Edit</Button>
                      <Button variant="danger" onClick={() => handleDelete(row)} style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}>Delete</Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${config.singular}` : `New ${config.singular}`}>
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {editing && (
            <div className="label-sm" style={{ margin: 0, display: "flex", gap: "1rem", flexWrap: "wrap", textTransform: "none", letterSpacing: 0 }}>
              <span>Code: {String(editing.code ?? "—")}</span>
              {editing.created_at ? <span>Created {formatDate(String(editing.created_at))}</span> : null}
              {editing.updated_at ? <span>Updated {formatDate(String(editing.updated_at))}</span> : null}
            </div>
          )}
          {config.fields.map((f) =>
            f.readOnly ? (
              <ReadOnlyField key={f.name} field={f} value={editing?.[f.name]} />
            ) : (
              <FieldInput
                key={f.name}
                field={f}
                value={form[f.name]}
                options={f.refTable ? refs[f.refTable] : undefined}
                onChange={(v) => setForm((prev) => ({ ...prev, [f.name]: v }))}
              />
            ),
          )}
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Update" : "Create"}</Button>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function FieldInput({
  field,
  value,
  options,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  options?: Row[];
  onChange: (v: unknown) => void;
}) {
  const v = value ?? "";
  const common = { id: field.name, className: "input" as const };

  return (
    <div>
      <label className="field-label" htmlFor={field.name}>
        {field.label}{field.required ? " *" : ""}
      </label>
      {field.type === "textarea" ? (
        <textarea className="textarea" id={field.name} value={String(v)} placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)} />
      ) : field.type === "select" ? (
        <select className="select" id={field.name} value={String(v)} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {field.options?.map((o) => <option key={o} value={o}>{STATUS_LABELS[o] ?? o}</option>)}
        </select>
      ) : field.type === "reference" ? (
        <select className="select" id={field.name} value={String(v)} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {(options ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {field.refLabel ? field.refLabel(o) : String(o.code ?? o.id)}
            </option>
          ))}
        </select>
      ) : field.type === "boolean" ? (
        <input type="checkbox" checked={Boolean(v)} onChange={(e) => onChange(e.target.checked)} style={{ width: "1.1rem", height: "1.1rem" }} />
      ) : (
        <input
          {...common}
          type={field.type === "number" || field.type === "currency" ? "number" : field.type === "date" ? "date" : "text"}
          step={field.type === "currency" ? "0.01" : field.type === "number" ? "any" : undefined}
          value={String(v)}
          placeholder={field.placeholder}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(field.type === "number" || field.type === "currency" ? (raw === "" ? "" : Number(raw)) : raw);
          }}
        />
      )}
      {field.help && <p className="label-sm" style={{ margin: "0.25rem 0 0", textTransform: "none", letterSpacing: 0 }}>{field.help}</p>}
    </div>
  );
}

function renderCell(f: FieldDef, row: Row, refs: RefMap) {
  const val = row[f.name];
  if (val === null || val === undefined || val === "") return "—";
  if (f.badge) return <Badge value={String(val)} />;
  if (f.type === "currency") return formatCurrency(Number(val));
  if (f.type === "date") return formatDate(String(val));
  if (f.type === "reference" && f.refTable) {
    const ref = (refs[f.refTable] ?? []).find((r) => r.id === val);
    return ref ? (f.refLabel ? f.refLabel(ref) : String(ref.code)) : "—";
  }
  return String(val);
}

/** Extract a human-readable message from an Error or a Supabase PostgrestError. */
function errorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [e.message, e.details, e.hint].filter(Boolean);
    if (parts.length > 0) return parts.join(" — ");
  }
  return err instanceof Error ? err.message : "Something went wrong";
}

function defaults(fields: FieldDef[]): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.readOnly) continue;
    f[field.name] =
      field.defaultValue ?? (field.type === "boolean" ? false : "");
  }
  return f;
}

function ReadOnlyField({ field, value }: { field: FieldDef; value: unknown }) {
  const empty = value === undefined || value === null || value === "";
  const display = empty
    ? "Auto-calculated on save"
    : field.type === "currency"
      ? formatCurrency(Number(value))
      : String(value);
  return (
    <div>
      <label className="field-label">{field.label}</label>
      <div
        className="input"
        aria-readonly="true"
        style={{
          background: "var(--surface-container)",
          color: "var(--on-surface-variant)",
          cursor: "not-allowed",
          fontStyle: empty ? "italic" : "normal",
        }}
      >
        {display}
      </div>
      <p className="label-sm" style={{ margin: "0.25rem 0 0", textTransform: "none", letterSpacing: 0 }}>
        {field.help ?? "Computed automatically"}
      </p>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className="label-sm" style={{ textAlign: align, padding: "0.85rem 1rem", whiteSpace: "nowrap" }}>
      {children}
    </th>
  );
}
function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <td style={{ padding: "0.75rem 1rem", textAlign: align, verticalAlign: "middle" }}>{children}</td>;
}
