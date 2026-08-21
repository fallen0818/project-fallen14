"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/lib/auth/role-context";
import {
  listRows,
  referenceOptions,
  createRow,
  updateRow,
  deleteRow,
  listLineItems,
  saveLineItems,
  createLookupOption,
  updateLookupOption,
  deleteLookupOption,
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

/**
 * True once `row` is permanently locked -- see EntityConfig.lockWhenTerminal.
 * Looks up the row's current value for that field in `refs` and checks the
 * referenced lookup_options row's `is_terminal` flag. Returns false for any
 * entity that doesn't opt into locking (lockWhenTerminal unset).
 */
function isRowLocked(config: EntityConfig, row: Row, refs: RefMap): boolean {
  const fieldName = config.lockWhenTerminal;
  if (!fieldName) return false;
  const val = row[fieldName];
  if (val === null || val === undefined || val === "") return false;
  const ref = (refs[fieldName] ?? []).find((r) => r.id === val);
  return Boolean(ref && (ref as Row & { is_terminal?: boolean }).is_terminal);
}

/**
 * A line-item reference field pointing at a full entity table (not
 * lookup_options -- the opposite of isLookupField) means "pick one row from
 * that table" -- e.g. a requisition line's Procurement Item. Picking the
 * same row on two different lines of the same list doesn't mean anything
 * different from combining them into one line with a larger quantity, and
 * for purchase_requisition_lines' procurement_item_id the database now
 * enforces this with a unique constraint (migration 0029) -- catch it here
 * first so the error reads as guidance instead of a raw duplicate-key
 * Postgres message surfacing only after a failed save.
 */
function duplicateLineReferenceErrors(config: LineItemsConfig, lines: LineDraft[]): string[] {
  const errors: string[] = [];
  for (const field of config.fields) {
    if (field.type !== "reference" || !field.refTable || field.refTable === "lookup_options") continue;
    const seen = new Set<string>();
    for (const line of lines) {
      const v = line[field.name];
      if (!v) continue;
      const key = String(v);
      if (seen.has(key)) {
        errors.push(`${field.label} is used by more than one line — combine them into a single line instead`);
        break;
      }
      seen.add(key);
    }
  }
  return errors;
}

export function EntityManager({ entityKey }: { entityKey: string }) {
  const config = ENTITIES_BY_KEY[entityKey];
  const supabase = useMemo(() => createClient(), []);
  const showToast = useToast();
  // Drives which write controls render -- RLS is the real enforcement
  // (migration 0033), this just keeps viewers from seeing buttons that
  // would fail. Guarded again inline in the handlers below, belt-and-suspenders.
  const canEdit = useRole() === "editor";

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

  // "What points at this record" for config.reverseLookup (e.g. a
  // Requisition's linked Procurement Items) -- fetched fresh whenever the
  // modal opens on an existing row. `reverseLookupAvailable` (unlinked rows,
  // column IS NULL) and `reverseLookupPick` only matter when
  // reverseLookup.editable is set -- that's what the "+ Link" picker offers.
  const [reverseLookupRows, setReverseLookupRows] = useState<Row[]>([]);
  const [reverseLookupAvailable, setReverseLookupAvailable] = useState<Row[]>([]);
  // Drives the "Manage" popup next to a lookup_options-backed dropdown (see
  // isLookupField) -- lets an editor rename, retone, or delete an existing
  // option right from the field, instead of asking for a database change
  // every time a value needs fixing (e.g. the stray "Approved" cleanup,
  // migration 0051). `scope` mirrors addLookupOption's: which options map
  // (refs vs lineRefs) to update once a change is made.
  const [manageField, setManageField] = useState<{ field: FieldDef; scope: "top" | "line" } | null>(null);
  const [reverseLookupPick, setReverseLookupPick] = useState("");
  const [reverseLookupLoading, setReverseLookupLoading] = useState(false);
  const [reverseLookupBusy, setReverseLookupBusy] = useState(false);

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

  async function openCreate() {
    if (!canEdit) return;
    setEditing(null);
    setForm(defaults(config.fields));
    const seeded = config.lineItems?.defaultLines?.() ?? [];
    setLineItems(seeded.map((line) => ({ _key: crypto.randomUUID(), ...line })));
    setOriginalLineItems([]);
    setReverseLookupRows([]);
    setReverseLookupAvailable([]);
    setReverseLookupPick("");
    setModalOpen(true);

    // A new row has no id yet, so nothing can point at it -- but the picker
    // dropdown (config.reverseLookup.editable) still needs its options list
    // up front, right in the create form. The actual link is applied in
    // handleSave once the new row's id exists.
    if (config.reverseLookup?.editable) {
      try {
        const { data, error } = await supabase
          .from(config.reverseLookup.table)
          .select("*")
          .is(config.reverseLookup.column, null);
        if (error) throw error;
        setReverseLookupAvailable((data ?? []) as Row[]);
      } catch (err) {
        showToast(errorMessage(err), "error");
      }
    }
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
    setReverseLookupRows([]);
    setReverseLookupAvailable([]);
    setReverseLookupPick("");
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

    if (config.reverseLookup) {
      setReverseLookupLoading(true);
      try {
        const { data, error } = await supabase
          .from(config.reverseLookup.table)
          .select("*")
          .eq(config.reverseLookup.column, row.id);
        if (error) throw error;
        setReverseLookupRows((data ?? []) as Row[]);

        if (config.reverseLookup.editable) {
          const { data: avail, error: availErr } = await supabase
            .from(config.reverseLookup.table)
            .select("*")
            .is(config.reverseLookup.column, null);
          if (availErr) throw availErr;
          setReverseLookupAvailable((avail ?? []) as Row[]);
        }
      } catch (err) {
        showToast(errorMessage(err), "error");
      } finally {
        setReverseLookupLoading(false);
      }
    }
  }

  /** Unlinks a listed reverseLookup row back to `column` = null. */
  async function unlinkReverseLookupRow(id: string) {
    if (!config.reverseLookup) return;
    setReverseLookupBusy(true);
    try {
      const { table, column } = config.reverseLookup;
      const { error } = await supabase.from(table).update({ [column]: null }).eq("id", id);
      if (error) throw error;
      const moved = reverseLookupRows.find((r) => r.id === id);
      setReverseLookupRows((prev) => prev.filter((r) => r.id !== id));
      if (moved) setReverseLookupAvailable((prev) => [...prev, { ...moved, [column]: null }]);
    } catch (err) {
      showToast(errorMessage(err), "error");
    } finally {
      setReverseLookupBusy(false);
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

  /** Syncs the right options map (refs vs lineRefs) after the "Manage"
   *  popup renames, retones, adds, or removes an option. */
  function applyManagedLookupOptions(field: FieldDef, scope: "top" | "line", next: Row[]) {
    const setter = scope === "top" ? setRefs : setLineRefs;
    setter((prev) => ({ ...prev, [field.name]: next }));
  }

  /** After a delete, blank out that field wherever the just-deleted option
   *  was still locally selected (an unsaved form value or line-item draft)
   *  so the dropdown doesn't sit on an id that no longer exists. A row
   *  already saved with this value in the database is unaffected -- the
   *  delete itself would have failed with a foreign-key error in that case
   *  (see deleteLookupOption), never reaching this point. */
  function clearStaleLookupSelection(field: FieldDef, scope: "top" | "line", deletedId: string) {
    if (scope === "top") {
      setForm((prev) => (prev[field.name] === deletedId ? { ...prev, [field.name]: "" } : prev));
    } else {
      setLineItems((prev) => prev.map((line) => (line[field.name] === deletedId ? { ...line, [field.name]: "" } : line)));
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
      let linkedCount = 0;

      if (convertTo.singleTargetPerParent) {
        // One shared target for every pending line, not one per line -- see
        // singleTargetPerParent's doc comment (types.ts). Reuse an existing
        // link if any line (converted earlier) already has one.
        const alreadyLinked = lineItems.find((l) => l[convertTo.linkColumn]);
        let targetId = alreadyLinked?.[convertTo.linkColumn] as string | undefined;

        if (!targetId) {
          const values = await convertTo.mapLine(pending[0], editing, supabase);
          const created = await createRow(supabase, targetConfig, values, user.id);
          targetId = created.id as string;
          createdCount = 1;
        }

        for (const line of pending) {
          const { error } = await supabase.from(lic.table).update({ [convertTo.linkColumn]: targetId }).eq("id", line.id as string);
          if (error) throw error;
          linkedCount++;
        }
        showToast(
          createdCount
            ? `Created 1 ${targetConfig.singular} and linked ${linkedCount} line${linkedCount === 1 ? "" : "s"} to it`
            : `Linked ${linkedCount} line${linkedCount === 1 ? "" : "s"} to the existing ${targetConfig.singular}`,
          "success",
        );
      } else {
        for (const line of pending) {
          const values = await convertTo.mapLine(line, editing, supabase);
          const created = await createRow(supabase, targetConfig, values, user.id);
          const { error } = await supabase.from(lic.table).update({ [convertTo.linkColumn]: created.id }).eq("id", line.id as string);
          if (error) throw error;
          createdCount++;
        }
        showToast(`Created ${createdCount} ${createdCount === 1 ? targetConfig.singular : targetConfig.plural}`, "success");
      }

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
    if (!canEdit) return;
    if (editing && isRowLocked(config, editing, refs)) return;
    const errors = validateValues(config.fields, form);
    if (config.lineItems) {
      for (const line of lineItems) errors.push(...validateValues(config.lineItems.fields, line));
      errors.push(...duplicateLineReferenceErrors(config.lineItems, lineItems));
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

      // Applies the reverseLookup picker's selection now that parentId is
      // known — this is what lets the picker work in the *create* form too
      // (a brand-new row has no id for the picked row to point at until
      // this point), not just when editing an existing one.
      if (config.reverseLookup?.editable && reverseLookupPick) {
        const { table, column } = config.reverseLookup;
        const { error } = await supabase.from(table).update({ [column]: parentId }).eq("id", reverseLookupPick);
        if (error) throw error;
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
    if (!canEdit) return;
    if (isRowLocked(config, row, refs)) return;
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
  // Drives the edit modal for a row that's hit a terminal status (see
  // EntityConfig.lockWhenTerminal) -- fields render read-only, line items and
  // Save/Convert controls disappear, same as the !canEdit viewer path below.
  const editingLocked = editing ? isRowLocked(config, editing, refs) : false;

  return (
    <>
      <PageHeader
        breadcrumb={config.breadcrumb}
        title={config.plural}
        actions={canEdit ? <Button onClick={openCreate}>+ New {config.singular}</Button> : undefined}
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
              {rows.map((row) => {
                const locked = isRowLocked(config, row, refs);
                return (
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
                        style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end", alignItems: "center" }}
                      >
                        {canEdit && !locked ? (
                          <>
                            <Button variant="secondary" onClick={() => openEdit(row)} style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}>Edit</Button>
                            <Button variant="danger" onClick={() => handleDelete(row)} style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}>Delete</Button>
                          </>
                        ) : (
                          <>
                            {locked && <span className="label-sm" style={{ textTransform: "none", letterSpacing: 0, color: "var(--on-surface-variant)" }}>Locked</span>}
                            <Button variant="secondary" onClick={() => openEdit(row)} style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}>View</Button>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${config.singular}` : `New ${config.singular}`}
        width={config.modalWidth ?? (config.lineItems ? `${Math.max(760, config.lineItems.fields.length * 170 + 260)}px` : undefined)}
      >
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {editing && (
            <div className="label-sm" style={{ margin: 0, display: "flex", gap: "1rem", flexWrap: "wrap", textTransform: "none", letterSpacing: 0 }}>
              <span>{primary.label}: {String(editing[config.primaryField] ?? "—")}</span>
              {editing.created_at ? <span>Created {formatDate(String(editing.created_at))}</span> : null}
              {editing.updated_at ? <span>Updated {formatDate(String(editing.updated_at))}</span> : null}
            </div>
          )}
          {editingLocked && (
            <div
              className="label-sm"
              style={{ margin: 0, textTransform: "none", letterSpacing: 0, background: "var(--surface-container)", padding: "0.6rem 0.85rem", borderRadius: "0.5rem" }}
            >
              This {config.singular.toLowerCase()}&apos;s status is final — it can no longer be edited or deleted.
            </div>
          )}
          {config.reverseLookup && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label className="field-label">{config.reverseLookup.label}</label>
              {editing && (
                reverseLookupLoading ? (
                  <p className="label-sm" style={{ margin: 0, textTransform: "none", letterSpacing: 0, color: "var(--on-surface-variant)" }}>Loading…</p>
                ) : reverseLookupRows.length === 0 ? (
                  <p className="label-sm" style={{ margin: 0, textTransform: "none", letterSpacing: 0, color: "var(--on-surface-variant)" }}>
                    {config.reverseLookup.editable
                      ? "None linked yet."
                      : `None yet — link one from ${ENTITIES_BY_KEY[config.reverseLookup.entityKey].plural}.`}
                  </p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                    {reverseLookupRows.map((r) => (
                      <span
                        key={r.id}
                        className="label-sm"
                        style={{
                          textTransform: "none",
                          letterSpacing: 0,
                          background: "var(--surface-container)",
                          padding: "0.3rem 0.65rem",
                          borderRadius: "999px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.4rem",
                        }}
                      >
                        <a
                          href={`/${config.module}/${config.reverseLookup!.entityKey}`}
                          style={{ textDecoration: "none", color: "var(--on-surface)" }}
                        >
                          {config.reverseLookup!.refLabel(r)}
                        </a>
                        {config.reverseLookup!.editable && canEdit && (
                          <button
                            type="button"
                            onClick={() => unlinkReverseLookupRow(String(r.id))}
                            disabled={reverseLookupBusy}
                            title="Unlink"
                            aria-label="Unlink"
                            style={{ background: "none", border: "none", color: "var(--on-surface-variant)", cursor: "pointer", padding: 0, lineHeight: 1, fontSize: "0.85rem" }}
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )
              )}
              {config.reverseLookup.editable && canEdit && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  <select
                    className="select"
                    style={{ width: "auto", minWidth: 200 }}
                    value={reverseLookupPick}
                    onChange={(e) => setReverseLookupPick(e.target.value)}
                    disabled={reverseLookupAvailable.length === 0}
                  >
                    <option value="">
                      {reverseLookupAvailable.length === 0 ? "No unlinked items available" : "Select one to link…"}
                    </option>
                    {reverseLookupAvailable.map((r) => (
                      <option key={r.id} value={String(r.id)}>
                        {config.reverseLookup!.refLabel(r)}
                      </option>
                    ))}
                  </select>
                  {reverseLookupPick && (
                    <p className="label-sm" style={{ margin: 0, textTransform: "none", letterSpacing: 0, color: "var(--on-surface-variant)" }}>
                      Will link when you {editing ? "save" : "create"} this {config.singular.toLowerCase()}.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          {config.fields.map((f) =>
            f.readOnly ? (
              <ReadOnlyField key={f.name} field={f} value={editing?.[f.name]} />
            ) : !canEdit || editingLocked ? (
              <ReadOnlyField key={f.name} field={f} value={form[f.name]} />
            ) : (
              <FieldInput
                key={f.name}
                field={f}
                value={form[f.name]}
                options={f.refTable ? refs[f.name] : undefined}
                onChange={(v) => setForm((prev) => ({ ...prev, [f.name]: v }))}
                onAddNew={isLookupField(f) ? () => addLookupOption(f, "top") : undefined}
                onManage={isLookupField(f) ? () => setManageField({ field: f, scope: "top" }) : undefined}
              />
            ),
          )}
          {config.lineItems && (
            <LineItemsEditor
              config={config.lineItems}
              lines={lineItems}
              refs={lineRefs}
              loading={lineItemsLoading}
              canEdit={canEdit && !editingLocked}
              onAdd={addLineItem}
              onChange={updateLineItem}
              onRemove={removeLineItem}
              onAddNewOption={(f) => addLookupOption(f, "line")}
              onManageOption={(f) => setManageField({ field: f, scope: "line" })}
            />
          )}
          {config.lineItems?.convertTo && editing && canEdit && !editingLocked && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="button" variant="secondary" onClick={handleConvert} disabled={converting}>
                {converting ? "Converting…" : config.lineItems.convertTo.buttonLabel}
              </Button>
            </div>
          )}
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
            {canEdit && !editingLocked ? (
              <>
                <Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Update" : "Create"}</Button>
                <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
              </>
            ) : (
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Close</Button>
            )}
          </div>
        </form>
      </Modal>

      {manageField && (
        <ManageLookupModal
          field={manageField.field}
          options={(manageField.scope === "top" ? refs : lineRefs)[manageField.field.name] ?? []}
          supabase={supabase}
          showToast={showToast}
          onChange={(next) => applyManagedLookupOptions(manageField.field, manageField.scope, next)}
          onDeleted={(id) => clearStaleLookupSelection(manageField.field, manageField.scope, id)}
          onClose={() => setManageField(null)}
        />
      )}
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
  onManage,
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
  /**
   * When set, a small "Manage" button renders next to the dropdown, opening
   * EntityManager's ManageLookupModal to rename, retone, or delete any of
   * this field's existing options in place — "+ Add new…" above only ever
   * adds.
   */
  onManage?: () => void;
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
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
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
        {onManage && (
          <button
            type="button"
            onClick={onManage}
            title={`Manage ${field.label} options`}
            aria-label={`Manage ${field.label} options`}
            style={{
              flex: "none",
              background: "none",
              border: "1px solid var(--outline-variant)",
              borderRadius: "0.4rem",
              padding: "0.4rem 0.55rem",
              cursor: "pointer",
              color: "var(--on-surface-variant)",
              lineHeight: 1,
            }}
          >
            ⚙
          </button>
        )}
        </div>
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

const TONE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Default (gray)" },
  { value: "success", label: "Green" },
  { value: "info", label: "Blue" },
  { value: "warning", label: "Orange" },
  { value: "error", label: "Red" },
  { value: "neutral", label: "Gray" },
];

/**
 * "Manage" popup for a lookup_options-backed dropdown (see isLookupField) —
 * rename, retone, or delete any existing option, right from the field that
 * uses it. Opened via the ⚙ button FieldInput renders next to the dropdown
 * when `onManage` is passed. Adding is already covered by "+ Add new…" on
 * the dropdown itself, so this only exposes edit/delete plus a lighter-weight
 * add row for convenience while the panel's already open.
 */
function ManageLookupModal({
  field,
  options,
  supabase,
  showToast,
  onChange,
  onDeleted,
  onClose,
}: {
  field: FieldDef;
  options: Row[];
  supabase: ReturnType<typeof createClient>;
  showToast: (message: string, variant?: "success" | "error" | "info") => void;
  onChange: (next: Row[]) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(options);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newValue, setNewValue] = useState("");
  const [newTone, setNewTone] = useState("");

  useEffect(() => setRows(options), [options]);

  function editRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveRow(row: Row) {
    const value = String(row.value ?? "").trim();
    if (!value) {
      showToast("Value can't be empty", "error");
      return;
    }
    setBusyId(row.id);
    try {
      const updated = await updateLookupOption(supabase, row.id, { value, tone: (row.tone as string) || null });
      const next = rows.map((r) => (r.id === row.id ? updated : r));
      setRows(next);
      onChange(next);
      showToast(`Updated "${value}"`, "success");
    } catch (err) {
      showToast(errorMessage(err), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function removeRow(row: Row) {
    const label = String(row.value ?? "this option");
    if (!window.confirm(`Delete "${label}"? This can't be undone.`)) return;
    setBusyId(row.id);
    try {
      await deleteLookupOption(supabase, row.id);
      const next = rows.filter((r) => r.id !== row.id);
      setRows(next);
      onChange(next);
      onDeleted(row.id);
      showToast(`Deleted "${label}"`, "info");
    } catch (err) {
      // Most likely a foreign-key violation (still selected on an existing
      // record) -- errorMessage() below turns that into a plain-language
      // explanation instead of the raw Postgres constraint name.
      showToast(errorMessage(err), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function addRow() {
    const value = newValue.trim();
    const listKey = field.refFilter?.value;
    if (!value || !listKey) return;
    setBusyId("__new__");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const created = await createLookupOption(supabase, listKey, value, user.id);
      const withTone = newTone ? await updateLookupOption(supabase, created.id, { tone: newTone }) : created;
      const next = [withTone, ...rows];
      setRows(next);
      onChange(next);
      setNewValue("");
      setNewTone("");
      showToast(`Added "${value}"`, "success");
    } catch (err) {
      showToast(errorMessage(err), "error");
    } finally {
      setBusyId(null);
    }
  }

  const gridCols = "1fr 130px auto auto";

  return (
    <Modal open onClose={onClose} title={`Manage ${field.label} options`} width="620px">
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <p className="label-sm" style={{ margin: 0, textTransform: "none", letterSpacing: 0, color: "var(--on-surface-variant)" }}>
          Rename, recolor, or delete an option below. Deleting one still selected on an existing record is blocked automatically.
        </p>

        {rows.length === 0 && (
          <p className="label-sm" style={{ textTransform: "none", letterSpacing: 0, color: "var(--on-surface-variant)" }}>No options yet.</p>
        )}

        {rows.map((row) => (
          <div key={row.id} style={{ display: "grid", gridTemplateColumns: gridCols, gap: "0.5rem", alignItems: "center" }}>
            <input
              className="input"
              value={String(row.value ?? "")}
              disabled={busyId === row.id}
              onChange={(e) => editRow(row.id, { value: e.target.value })}
            />
            <select
              className="select"
              value={String(row.tone ?? "")}
              disabled={busyId === row.id}
              onChange={(e) => editRow(row.id, { tone: e.target.value || null })}
            >
              {TONE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <Button type="button" variant="secondary" disabled={busyId === row.id} onClick={() => saveRow(row)} style={{ padding: "0.35rem 0.7rem", fontSize: "0.78rem" }}>
              Save
            </Button>
            <Button type="button" variant="danger" disabled={busyId === row.id} onClick={() => removeRow(row)} style={{ padding: "0.35rem 0.7rem", fontSize: "0.78rem" }}>
              Delete
            </Button>
          </div>
        ))}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridCols,
            gap: "0.5rem",
            alignItems: "center",
            borderTop: "1px solid var(--surface-container-high)",
            paddingTop: "0.6rem",
            marginTop: "0.2rem",
          }}
        >
          <input className="input" placeholder="New value…" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
          <select className="select" value={newTone} onChange={(e) => setNewTone(e.target.value)}>
            {TONE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <Button type="button" variant="secondary" disabled={busyId === "__new__" || !newValue.trim()} onClick={addRow} style={{ padding: "0.35rem 0.7rem", fontSize: "0.78rem" }}>
            Add
          </Button>
          <span />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.4rem" }}>
          <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
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
  canEdit,
  onAdd,
  onChange,
  onRemove,
  onAddNewOption,
  onManageOption,
}: {
  config: LineItemsConfig;
  lines: LineDraft[];
  refs: RefMap;
  loading: boolean;
  canEdit: boolean;
  onAdd: () => void;
  onChange: (index: number, name: string, value: unknown) => void;
  onRemove: (index: number) => void;
  onAddNewOption: (field: FieldDef) => Promise<string | null>;
  onManageOption: (field: FieldDef) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
        <label className="field-label" style={{ margin: 0 }}>{config.label}</label>
        {canEdit && (
          <Button type="button" variant="secondary" onClick={onAdd} style={{ padding: "0.3rem 0.7rem", fontSize: "0.78rem" }}>
            {config.addLabel ?? "+ Add line"}
          </Button>
        )}
      </div>

      {loading ? (
        <p className="label-sm" style={{ textTransform: "none", letterSpacing: 0, color: "var(--on-surface-variant)" }}>Loading…</p>
      ) : lines.length === 0 ? (
        <p className="label-sm" style={{ textTransform: "none", letterSpacing: 0, color: "var(--on-surface-variant)" }}>
          None added yet.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {lines.map((line, i) => {
              const converted = Boolean(config.convertTo && line[config.convertTo.linkColumn]);
              return (
                <div key={line._key}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: canEdit ? `repeat(${config.fields.length}, 1fr) auto` : `repeat(${config.fields.length}, 1fr)`,
                      gap: "0.6rem",
                      alignItems: "end",
                      background: "var(--surface-container-low)",
                      padding: "0.6rem",
                      borderRadius: "0.5rem",
                    }}
                  >
                    {config.fields.map((f) =>
                      f.readOnly || !canEdit ? (
                        <LineReadOnlyField key={f.name} field={f} value={f.compute ? f.compute(line) : line[f.name]} />
                      ) : (
                        <FieldInput
                          key={f.name}
                          id={`${line._key}-${f.name}`}
                          field={f}
                          value={line[f.name]}
                          options={f.refTable ? refs[f.name] : undefined}
                          onChange={(v) => onChange(i, f.name, v)}
                          onAddNew={isLookupField(f) ? () => onAddNewOption(f) : undefined}
                          onManage={isLookupField(f) ? () => onManageOption(f) : undefined}
                        />
                      ),
                    )}
                    {canEdit && (
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => onRemove(i)}
                        style={{ padding: "0.55rem 0.7rem", fontSize: "0.78rem", height: "fit-content" }}
                      >
                        Remove
                      </Button>
                    )}
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
          {config.totalField && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "baseline",
                gap: "0.5rem",
                marginTop: "0.6rem",
                paddingTop: "0.6rem",
                borderTop: "1px solid var(--surface-container-high)",
              }}
            >
              <span className="label-sm" style={{ margin: 0 }}>{config.totalLabel ?? "Total"}</span>
              <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>{formatCurrency(lineItemsTotal(config, lines))}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Sum of `config.totalField` (using its `compute`, if set) across every line. */
function lineItemsTotal(config: LineItemsConfig, lines: LineDraft[]): number {
  const field = config.fields.find((f) => f.name === config.totalField);
  if (!field) return 0;
  return lines.reduce((sum, line) => {
    const v = field.compute ? field.compute(line) : line[field.name];
    return sum + (Number(v) || 0);
  }, 0);
}

/**
 * Disabled display box for a readOnly line-item field — the LineItemsEditor
 * equivalent of the top-level form's ReadOnlyField, but compact (no help
 * paragraph) to fit the dense per-line grid. `value` is normally
 * `field.compute?.(line) ?? line[field.name]`, computed by the caller.
 */
function LineReadOnlyField({ field, value }: { field: FieldDef; value: unknown }) {
  const empty = value === undefined || value === null || value === "";
  const display = empty ? "—" : field.type === "currency" ? formatCurrency(Number(value)) : String(value);
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
        }}
      >
        {display}
      </div>
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
    // badge-under-evaluation) instead of falling back to the plain gray badge
    // -- unless the option has its own `tone` set (via the ⚙ Manage control),
    // which takes priority (see Badge.tsx).
    return f.badge ? <Badge value={toKebabCase(label)} label={label} tone={ref.tone as string | null | undefined} /> : label;
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
    // Postgres foreign-key violation -- most commonly hit here when
    // deleting a lookup_options row (see ManageLookupModal) that's still
    // selected on an existing record. Every *_id column that references
    // lookup_options does so with "on delete restrict" (or the equivalent
    // implicit default), so the raw error is a constraint name that means
    // nothing to the user -- give them the plain-language reason instead.
    if (e.code === "23503") {
      return "Can't delete — it's still selected on one or more existing records. Change those records' value first, or leave this option in place.";
    }
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
