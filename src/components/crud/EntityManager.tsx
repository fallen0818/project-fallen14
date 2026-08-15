"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  listRows,
  referenceOptions,
  createRow,
  updateRow,
  deleteRow,
  listLineItems,
  saveLineItems,
  createLookupOption,
  type Row,
  type LineRow,
} from "@/lib/crud/service";
import type { EntityConfig, FieldDef, LineItemsConfig } from "@/lib/crud/types";
import { ENTITIES_BY_KEY } from "@/lib/crud/configs";
import { validateValues } from "@/lib/crud/validation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";

/** Keyed by field name (not refTable) — two fields can point at the same
 *  table with different refFilter values (e.g. two lookup_options fields
 *  filtered to different list_keys) and need separate option lists. */
type RefMap = Record<string, Row[]>;

/**
 * A line-item row being edited client-side. `_key` is a client-only React
 * list key (stripped before saving) since a freshly-added line has no `id`
 * yet — it's kept separate from `RefMap` lookups (a line-item field can
 * share a name with a top-level field, e.g. both have their own "status_id"
 * pointing at different lookup_options lists; a second RefMap keyed the same
 * way as the parent's would collide).
 */
type LineDraft = Record<string, unknown> & { _key: string; id?: string };

/**
 * True for a "reference" field built with configs.ts's `lookupRef()` --
 * i.e. it points at `lookup_options` filtered to one list_key, so its
 * dropdown can offer "+ Add new…" (see addLookupOption). Excludes reference
 * fields pointing at a full entity table (vendors, contractors, other
 * capex_budgets/asset_requests rows, ...) -- those have their own required
 * fields beyond a single value and can't be created from a one-line prompt.
 */
function isLookupField(f: FieldDef): boolean {
  return f.type === "reference" && f.refTable === "lookup_options" && !!f.refFilter;
}

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

  // Line items (e.g. a procurement item's bidding schedule activities):
  // `lineItems` is the editable working copy shown in the modal, `original
  // LineItems` is what's actually in the database right now (fetched on
  // open, empty for a brand-new row), used to diff out deletions on save.
  const [lineItems, setLineItems] = useState<LineDraft[]>([]);
  const [originalLineItems, setOriginalLineItems] = useState<LineRow[]>([]);
  const [lineRefs, setLineRefs] = useState<RefMap>({});
  const [lineItemsLoading, setLineItemsLoading] = useState(false);
  const [converting, setConverting] = useState(false);

  const referenceFields = useMemo(
    () => config.fields.filter((f) => f.type === "reference" && f.refTable),
    [config],
  );
  const lineItemReferenceFields = useMemo(
    () => config.lineItems?.fields.filter((f) => f.type === "reference" && f.refTable) ?? [],
    [config],
  );

  const load = useCallback(async () => {
    try {
      const [data, refEntries, lineRefEntries] = await Promise.all([
        listRows(supabase, config),
        Promise.all(
          referenceFields.map(async (f) => [
            f.name,
            await referenceOptions(supabase, f.refTable as string, f.refFilter),
          ] as const),
        ),
        Promise.all(
          lineItemReferenceFields.map(async (f) => [
            f.name,
            await referenceOptions(supabase, f.refTable as string, f.refFilter),
          ] as const),
        ),
      ]);
      setRows(data);
      setRefs(Object.fromEntries(refEntries));
      setLineRefs(Object.fromEntries(lineRefEntries));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load", "error");
    } finally {
      setLoading(false);
    }
  }, [supabase, config, referenceFields, lineItemReferenceFields, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(defaults(config.fields));
    const seeded = config.lineItems?.defaultLines?.() ?? [];
    setLineItems(seeded.map((line) => ({ _key: crypto.randomUUID(), ...line })));
    setOriginalLineItems([]);
    setModalOpen(true);
  }

  async function openEdit(row: Row) {
    setEditing(row);
    const f: Record<string, unknown> = {};
    for (const field of config.fields) {
      if (field.readOnly) continue;
      f[field.name] = row[field.name] ?? "";
    }
    setForm(f);
    // Open immediately — don't make the double-click feel laggy while line
    // items load in the background.
    setLineItems([]);
    setOriginalLineItems([]);
    setModalOpen(true);

    if (config.lineItems) {
      setLineItemsLoading(true);
      try {
        const existing = await listLineItems(supabase, config.lineItems.table, config.lineItems.parentColumn, row.id);
        setOriginalLineItems(existing);
        setLineItems(existing.map((r) => ({ ...r, _key: crypto.randomUUID() })));
      } catch (err) {
        showToast(errorMessage(err), "error");
      } finally {
        setLineItemsLoading(false);
      }
    }
  }

  function addLineItem() {
    if (!config.lineItems) return;
    setLineItems((prev) => [...prev, { _key: crypto.randomUUID(), ...config.lineItems!.emptyLine() }]);
  }
  function updateLineItem(index: number, name: string, value: unknown) {
    setLineItems((prev) => prev.map((row, i) => (i === index ? { ...row, [name]: value } : row)));
  }
  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  /**
   * Handle "+ Add new…" in a lookup_options-backed dropdown (see
   * isLookupField): prompts for the new value, writes it to lookup_options
   * under that field's list_key, merges it into the right options map so it
   * shows up immediately without a full reload, and returns its id so the
   * caller can select it right away. `scope` picks refs vs. lineRefs since a
   * top-level field and a line-item field can share a name but need separate
   * option lists (see RefMap's doc comment above).
   */
  async function addLookupOption(field: FieldDef, scope: "top" | "line"): Promise<string | null> {
    const listKey = field.refFilter?.value;
    if (!listKey) return null;
    const value = window.prompt(`New ${field.label} value:`)?.trim();
    if (!value) return null;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const created = await createLookupOption(supabase, listKey, value, user.id);
      const setter = scope === "top" ? setRefs : setLineRefs;
      setter((prev) => ({ ...prev, [field.name]: [created, ...(prev[field.name] ?? [])] }));
      showToast(`Added "${value}" to ${field.label}`, "success");
      return created.id;
    } catch (err) {
      showToast(errorMessage(err), "error");
      return null;
    }
  }

  /**
   * Turn each not-yet-converted line into a row of another entity (e.g. a
   * BOM line becomes a Procurement Item) — see LineItemsConfig["convertTo"].
   * Only already-saved lines (a real `id`) are eligible, so a line added in
   * this same edit session but not yet Updated is simply skipped for now —
   * it'll be eligible the next time this runs, after a save.
   */
  async function handleConvert() {
    const lic = config.lineItems;
    const convertTo = lic?.convertTo;
    if (!lic || !convertTo || !editing) return;

    const pending = lineItems.filter((l) => l.id && !l[convertTo.linkColumn]);
    if (pending.length === 0) {
      showToast(`Nothing to convert — save any new lines first, or every line already has a linked ${ENTITIES_BY_KEY[convertTo.entityKey].singular}`, "info");
      return;
    }

    setConverting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const targetConfig = ENTITIES_BY_KEY[convertTo.entityKey];
      let createdCount = 0;
      for (const line of pending) {
        const values = await convertTo.mapLine(line, editing, supabase);
        const created = await createRow(supabase, targetConfig, values, user.id);
        const { error } = await supabase.from(lic.table).update({ [convertTo.linkColumn]: created.id }).eq("id", line.id as string);
        if (error) throw error;
        createdCount++;
      }
      showToast(`Created ${createdCount} ${createdCount === 1 ? targetConfig.singular : targetConfig.plural}`, "success");

      const refreshed = await listLineItems(supabase, lic.table, lic.parentColumn, editing.id);
      setOriginalLineItems(refreshed);
      setLineItems(refreshed.map((r) => ({ ...r, _key: crypto.randomUUID() })));
    } catch (err) {
      console.error(`[${lic.table}] convert failed:`, JSON.stringify(err, null, 2));
      showToast(errorMessage(err), "error");
    } finally {
      setConverting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const errors = validateValues(config.fields, form);
    if (config.lineItems) {
      for (const line of lineItems) errors.push(...validateValues(config.lineItems.fields, line));
    }
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

      let parentId: string;
      if (editing) {
        await updateRow(supabase, config, editing.id, form);
        parentId = editing.id;
      } else {
        const created = await createRow(supabase, config, form, user.id);
        parentId = created.id;
      }

      if (config.lineItems) {
        const payload = lineItems.map(({ _key, ...rest }) => rest);
        await saveLineItems(supabase, config.lineItems.table, config.lineItems.parentColumn, parentId, config.lineItems.fields, originalLineItems, payload);
      }

      showToast(`${config.singular} ${editing ? "updated" : "created"}`, "success");
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
    if (!confirm(`Delete ${row[config.primaryField] ?? config.singular}? This cannot be undone.`)) return;
    try {
      await deleteRow(supabase, config, row.id);
      showToast(`${config.singular} deleted`, "info");
      await load();
    } catch (err) {
      console.error(`[${config.table}] delete failed`, err);
      showToast(errorMessage(err), "error");
    }
  }

  // The first list column and the edit-modal header show config.primaryField
  // (usually "code", but "name" for reference-data entities like vendors and
  // contractors that have no code column at all). Drop it from listFields so
  // it isn't rendered a second time when it's also marked inList (as "name"
  // is on vendors/contractors).
  const primary = primaryFieldMeta(config);
  const listFields = config.fields.filter((f) => f.inList && f.name !== config.primaryField);

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
                <Th>{primary.label}</Th>
                {listFields.map((f) => <Th key={f.name}>{f.label}</Th>)}
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onDoubleClick={() => openEdit(row)}
                  title="Double-click to view/edit"
                  style={{ borderTop: "1px solid var(--surface-container-high)", cursor: "pointer" }}
                >
                  <Td><span style={{ fontWeight: 600 }}>{String(row[config.primaryField] ?? "—")}</span></Td>
                  {listFields.map((f) => (
                    <Td key={f.name}>{renderCell(f, row, refs)}</Td>
                  ))}
                  <Td align="right">
                    <div
                      onDoubleClick={(e) => e.stopPropagation()}
                      style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}
                    >
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${config.singular}` : `New ${config.singular}`}
        width={config.lineItems ? `${Math.max(760, config.lineItems.fields.length * 170 + 260)}px` : undefined}
      >
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {editing && (
            <div className="label-sm" style={{ margin: 0, display: "flex", gap: "1rem", flexWrap: "wrap", textTransform: "none", letterSpacing: 0 }}>
              <span>{primary.label}: {String(editing[config.primaryField] ?? "—")}</span>
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
                options={f.refTable ? refs[f.name] : undefined}
                onChange={(v) => setForm((prev) => ({ ...prev, [f.name]: v }))}
                onAddNew={isLookupField(f) ? () => addLookupOption(f, "top") : undefined}
              />
            ),
          )}
          {config.lineItems && (
            <LineItemsEditor
              config={config.lineItems}
              lines={lineItems}
              refs={lineRefs}
              loading={lineItemsLoading}
              onAdd={addLineItem}
              onChange={updateLineItem}
              onRemove={removeLineItem}
              onAddNewOption={(f) => addLookupOption(f, "line")}
            />
          )}
          {config.lineItems?.convertTo && editing && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="button" variant="secondary" onClick={handleConvert} disabled={converting}>
                {converting ? "Converting…" : config.lineItems.convertTo.buttonLabel}
              </Button>
            </div>
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

/** Sentinel <option> value for "+ Add new…" — chosen so it can never collide
 *  with a real lookup_options uuid. */
const ADD_NEW_OPTION = "__add_new__";

function FieldInput({
  field,
  value,
  options,
  onChange,
  onAddNew,
  id,
}: {
  field: FieldDef;
  value: unknown;
  options?: Row[];
  onChange: (v: unknown) => void;
  /**
   * When set, the field's dropdown gets a trailing "+ Add new…" option.
   * Picking it calls this to prompt for and create the new value (see
   * EntityManager's addLookupOption) and resolves to the new row's id, or
   * null if the user cancelled — in which case the select reverts to
   * whatever was already chosen instead of landing on the sentinel value.
   */
  onAddNew?: () => Promise<string | null>;
  /** DOM id override — needed when the same field renders repeatedly, e.g.
   *  one row per dynamically-added line item, where reusing field.name as
   *  the id would produce duplicate DOM ids. */
  id?: string;
}) {
  const v = value ?? "";
  const domId = id ?? field.name;
  const common = { id: domId, className: "input" as const };

  return (
    <div>
      <label className="field-label" htmlFor={domId}>
        {field.label}{field.required ? " *" : ""}
      </label>
      {field.type === "textarea" ? (
        <textarea className="textarea" id={domId} value={String(v)} placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)} />
      ) : field.type === "select" ? (
        <select className="select" id={domId} value={String(v)} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {field.options?.map((o) => <option key={o} value={o}>{STATUS_LABELS[o] ?? o}</option>)}
        </select>
      ) : field.type === "reference" ? (
        <select
          className="select"
          id={domId}
          value={String(v)}
          onChange={async (e) => {
            const selected = e.target.value;
            if (selected !== ADD_NEW_OPTION) {
              onChange(selected);
              return;
            }
            // Reset the <select> back to the current value immediately so it
            // doesn't sit on the sentinel option while the prompt is open;
            // onAddNew's own result (or null on cancel) is applied after.
            e.target.value = String(v);
            const newId = await onAddNew?.();
            if (newId) onChange(newId);
          }}
        >
          <option value="">Select…</option>
          {(options ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {field.refLabel ? field.refLabel(o) : String(o.code ?? o.id)}
            </option>
          ))}
          {onAddNew && <option value={ADD_NEW_OPTION}>+ Add new…</option>}
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

/**
 * Editable list of a parent entity's child "line items" (e.g. a procurement
 * item's bidding schedule: Pre-bid Conference, Opening of Bids, ...) — rows
 * can be added or removed freely; nothing is persisted until the parent
 * form's own Save/Create button is pressed (see handleSave, which diffs
 * `lines` against what's actually in the database and reconciles).
 */
function LineItemsEditor({
  config,
  lines,
  refs,
  loading,
  onAdd,
  onChange,
  onRemove,
  onAddNewOption,
}: {
  config: LineItemsConfig;
  lines: LineDraft[];
  refs: RefMap;
  loading: boolean;
  onAdd: () => void;
  onChange: (index: number, name: string, value: unknown) => void;
  onRemove: (index: number) => void;
  onAddNewOption: (field: FieldDef) => Promise<string | null>;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
        <label className="field-label" style={{ margin: 0 }}>{config.label}</label>
        <Button type="button" variant="secondary" onClick={onAdd} style={{ padding: "0.3rem 0.7rem", fontSize: "0.78rem" }}>
          {config.addLabel ?? "+ Add line"}
        </Button>
      </div>

      {loading ? (
        <p className="label-sm" style={{ textTransform: "none", letterSpacing: 0, color: "var(--on-surface-variant)" }}>Loading…</p>
      ) : lines.length === 0 ? (
        <p className="label-sm" style={{ textTransform: "none", letterSpacing: 0, color: "var(--on-surface-variant)" }}>
          None added yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {lines.map((line, i) => {
            const converted = Boolean(config.convertTo && line[config.convertTo.linkColumn]);
            return (
              <div key={line._key}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${config.fields.length}, 1fr) auto`,
                    gap: "0.6rem",
                    alignItems: "end",
                    background: "var(--surface-container-low)",
                    padding: "0.6rem",
                    borderRadius: "0.5rem",
                  }}
                >
                  {config.fields.map((f) => (
                    <FieldInput
                      key={f.name}
                      id={`${line._key}-${f.name}`}
                      field={f}
                      value={line[f.name]}
                      options={f.refTable ? refs[f.name] : undefined}
                      onChange={(v) => onChange(i, f.name, v)}
                      onAddNew={isLookupField(f) ? () => onAddNewOption(f) : undefined}
                    />
                  ))}
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => onRemove(i)}
                    style={{ padding: "0.55rem 0.7rem", fontSize: "0.78rem", height: "fit-content" }}
                  >
                    Remove
                  </Button>
                </div>
                {converted && (
                  <p className="label-sm" style={{ margin: "0.3rem 0 0 0.2rem", textTransform: "none", letterSpacing: 0, color: "var(--tertiary, #2e9e5b)" }}>
                    ✓ Converted to a {ENTITIES_BY_KEY[config.convertTo!.entityKey].singular}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function renderCell(f: FieldDef, row: Row, refs: RefMap) {
  const val = row[f.name];
  if (val === null || val === undefined || val === "") return "—";
  if (f.type === "boolean") return val ? "Yes" : "No";
  if (f.type === "currency") return formatCurrency(Number(val));
  if (f.type === "date") return formatDate(String(val));
  if (f.type === "reference" && f.refTable) {
    const ref = (refs[f.name] ?? []).find((r) => r.id === val);
    if (!ref) return "—";
    const label = f.refLabel ? f.refLabel(ref) : String(ref.code ?? ref.id);
    // Reference-backed badges (e.g. a lookup_options status) show the human
    // label but color themselves off a kebab-case key, so they still pick up
    // the badge-<status> classes in globals.css (e.g. "Under Evaluation" ->
    // badge-under-evaluation) instead of falling back to the plain gray badge.
    return f.badge ? <Badge value={toKebabCase(label)} label={label} /> : label;
  }
  if (f.badge) return <Badge value={String(val)} />;
  return String(val);
}

function toKebabCase(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "-");
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

/**
 * Label for the entity's primary column (first column in the list table,
 * header in the edit modal). Most entities key off an auto-generated `code`
 * column that isn't itself declared in `fields`, so that's the default label.
 * Reference-data entities with no code column (vendors, contractors) set
 * primaryField to a real field name instead (e.g. "name") — look up that
 * field's own label so the column reads "Name", not "Code".
 */
function primaryFieldMeta(config: EntityConfig): { label: string } {
  if (config.primaryField === "code") return { label: "Code" };
  const field = config.fields.find((f) => f.name === config.primaryField);
  return { label: field?.label ?? config.primaryField };
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
