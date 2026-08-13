import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntityConfig } from "./types";

export type Row = Record<string, unknown> & { id: string; code?: string };

/** List rows for an entity, newest first. */
export async function listRows(
  supabase: SupabaseClient,
  config: EntityConfig,
): Promise<Row[]> {
  const { data, error } = await supabase
    .from(config.table)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Row[];
}

/** Fetch options for a reference field: {id, code, title/name}. */
export async function referenceOptions(
  supabase: SupabaseClient,
  refTable: string,
  refFilter?: { column: string; value: string },
): Promise<Row[]> {
  let query = supabase.from(refTable).select("*");
  if (refFilter) query = query.eq(refFilter.column, refFilter.value);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Row[];
}

/** Create a row, auto-generating its code and stamping owner_id. */
export async function createRow(
  supabase: SupabaseClient,
  config: EntityConfig,
  values: Record<string, unknown>,
  ownerId: string,
): Promise<Row> {
  const code = config.makeCode ? await config.makeCode(supabase, values) : undefined;
  const { data, error } = await supabase
    .from(config.table)
    .insert({
      ...clean(writable(config, values)),
      ...(code ? { code } : {}),
      ...(config.noOwner ? {} : { owner_id: ownerId }),
    })
    .select()
    .single();
  if (error) throw error;
  return data as Row;
}

/** Update a row (code and owner_id are immutable here). */
export async function updateRow(
  supabase: SupabaseClient,
  config: EntityConfig,
  id: string,
  values: Record<string, unknown>,
): Promise<Row> {
  const { data, error } = await supabase
    .from(config.table)
    .update(clean(writable(config, values)))
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Row;
}

export async function deleteRow(
  supabase: SupabaseClient,
  config: EntityConfig,
  id: string,
): Promise<void> {
  const { error } = await supabase.from(config.table).delete().eq("id", id);
  if (error) throw error;
}

export type LineRow = Record<string, unknown> & { id?: string };

/**
 * Fetch a parent row's child "line items" (e.g. a procurement item's bidding
 * schedule activities). Only meaningful once the parent has an id — a
 * not-yet-saved new row has no children yet.
 */
export async function listLineItems(
  supabase: SupabaseClient,
  table: string,
  parentColumn: string,
  parentId: string,
): Promise<LineRow[]> {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq(parentColumn, parentId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as LineRow[];
}

/**
 * Reconcile a child "line items" table against its edited state after the
 * parent row has been saved (so parentId is always known by the time this
 * runs, even for a brand-new parent). Rows dropped from `current` (present
 * in `original` but no longer present) are deleted; rows with no `id` yet
 * are freshly-added lines and get inserted with the parent FK stamped on;
 * everything else is an update-in-place.
 */
export async function saveLineItems(
  supabase: SupabaseClient,
  table: string,
  parentColumn: string,
  parentId: string,
  original: LineRow[],
  current: LineRow[],
): Promise<void> {
  const originalIds = new Set(original.map((r) => r.id).filter(Boolean) as string[]);
  const currentIds = new Set(current.map((r) => r.id).filter(Boolean) as string[]);

  const toDelete = [...originalIds].filter((id) => !currentIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await supabase.from(table).delete().in("id", toDelete);
    if (error) throw error;
  }

  for (const row of current) {
    const { id, ...values } = row;
    if (id) {
      const { error } = await supabase.from(table).update(clean(values)).eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from(table).insert({ ...clean(values), [parentColumn]: parentId });
      if (error) throw error;
    }
  }
}

/**
 * Keep only writable fields: drop read-only (database-generated) columns and
 * any keys not declared in the entity config. Prevents writes to generated
 * columns, which Postgres rejects with a 400.
 */
function writable(
  config: EntityConfig,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const writableNames = new Set(
    config.fields.filter((f) => !f.readOnly).map((f) => f.name),
  );
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (writableNames.has(k)) out[k] = v;
  }
  return out;
}

/** Drop empty-string values so they land as NULL, not "". */
export function clean(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    out[k] = v === "" ? null : v;
  }
  return out;
}

/**
 * Pure helper: compute the next code for a prefix from a list of existing codes.
 * e.g. computeNextCode(["CAPEX-000041"], "CAPEX-", 6) -> "CAPEX-000042".
 * Exported for unit testing.
 */
export function computeNextCode(
  codes: string[],
  prefix: string,
  width: number,
): string {
  let max = 0;
  for (const code of codes) {
    if (!code || !code.startsWith(prefix)) continue;
    const n = parseInt(code.slice(prefix.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

/**
 * Next sequential code for a prefix, e.g. prefix "CAPEX-" width 6 -> "CAPEX-000042".
 * Reads existing codes with the prefix and increments the max numeric suffix.
 */
export async function nextSequentialCode(
  supabase: SupabaseClient,
  table: string,
  prefix: string,
  width: number,
): Promise<string> {
  const { data, error } = await supabase
    .from(table)
    .select("code")
    .like("code", `${prefix}%`);
  if (error) throw error;

  const codes = (data ?? []).map((r) => (r as { code: string }).code ?? "");
  return computeNextCode(codes, prefix, width);
}
