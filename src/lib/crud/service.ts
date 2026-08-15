import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntityConfig, FieldDef } from "./types";

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

/**
 * Add a new value to a `lookup_options` list (e.g. "+ Add new…" in a
 * reference dropdown built with `lookupRef()` in configs.ts). Every list is
 * seeded with its own code prefix (ACAT-0007, BSTA-0005, ...) -- rather than
 * hardcode a mapping from list_key to prefix here, infer it from that list's
 * own existing codes and keep numbering in the same scheme. A list with no
 * codes yet (none should exist among the ones wired up today, but a
 * brand-new list_key created entirely through the UI could hit this) falls
 * back to a prefix derived from the list_key itself.
 */
export async function createLookupOption(
  supabase: SupabaseClient,
  listKey: string,
  value: string,
  ownerId: string,
): Promise<Row> {
  const { data: existing, error: fetchError } = await supabase
    .from("lookup_options")
    .select("code")
    .eq("list_key", listKey);
  if (fetchError) throw fetchError;

  const codes = (existing ?? []).map((r) => (r as { code: string }).code ?? "");
  const sample = codes.find((c) => /^[A-Za-z]+-\d+$/.test(c));
  const dash = sample?.lastIndexOf("-") ?? -1;
  const [prefix, width] =
    sample && dash >= 0
      ? [sample.slice(0, dash + 1).toUpperCase(), sample.length - dash - 1]
      : [`${listKey.replace(/[^a-z]/gi, "").slice(0, 4).toUpperCase()}-`, 4];
  const code = computeNextCode(codes, prefix, width);

  const { data, error } = await supabase
    .from("lookup_options")
    .insert({ list_key: listKey, code, value, owner_id: ownerId })
    .select()
    .single();
  if (error) throw error;
  return data as Row;
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
      ...clean(writable(config, values), config.fields),
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
    .update(clean(writable(config, values), config.fields))
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
 *
 * `fields` restricts what actually gets written to the columns declared in
 * the entity's LineItemsConfig. A line fetched via listLineItems() carries
 * every column the child table has (select "*") -- including ones that
 * aren't meant to round-trip through a routine save: a generated column
 * like bill_of_materials_lines.estimated_total_cost (Postgres rejects any
 * write to it outright, "can only be updated to DEFAULT"), system columns
 * (created_at/updated_at/the parent FK), or a convertTo linkColumn that's
 * only ever set by its own dedicated update in handleConvert(). Without
 * this filter, editing an existing row with lines that already have such
 * columns populated fails immediately -- a brand-new parent's freshly-added
 * lines have no `id` and start from emptyLine() (which only sets the
 * editable columns), so creation looks fine and only editing breaks.
 */
export async function saveLineItems(
  supabase: SupabaseClient,
  table: string,
  parentColumn: string,
  parentId: string,
  fields: FieldDef[],
  original: LineRow[],
  current: LineRow[],
): Promise<void> {
  const writableNames = new Set(fields.filter((f) => !f.readOnly).map((f) => f.name));
  const originalIds = new Set(original.map((r) => r.id).filter(Boolean) as string[]);
  const currentIds = new Set(current.map((r) => r.id).filter(Boolean) as string[]);

  const toDelete = [...originalIds].filter((id) => !currentIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await supabase.from(table).delete().in("id", toDelete);
    if (error) throw error;
  }

  for (const row of current) {
    const { id, ...rest } = row;
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (writableNames.has(k)) values[k] = v;
    }
    if (id) {
      const { error } = await supabase.from(table).update(clean(values, fields)).eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from(table).insert({ ...clean(values, fields), [parentColumn]: parentId });
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

/**
 * Drop empty-string values so they land as NULL, not "" -- except for a
 * field with a `defaultValue` (e.g. capex_budgets.committed_amount, `not
 * null default 0` in Postgres: optional in the form, but an explicit null
 * still trips the not-null constraint). A cleared field like that falls back
 * to its defaultValue instead of null, mirroring what the DB default would
 * have produced if the column had been omitted entirely.
 */
export function clean(
  values: Record<string, unknown>,
  fields: FieldDef[] = [],
): Record<string, unknown> {
  const defaultsByName = new Map(fields.map((f) => [f.name, f.defaultValue]));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v !== "") {
      out[k] = v;
      continue;
    }
    const d = defaultsByName.get(k);
    out[k] = d !== undefined ? d : null;
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
