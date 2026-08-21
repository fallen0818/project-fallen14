import type { SupabaseClient } from "@supabase/supabase-js";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "currency"
  | "date"
  | "select"
  | "reference"
  | "boolean";

export interface FieldDef {
  /** Column name in the table. */
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** For type "select": the allowed values. */
  options?: readonly string[];
  /** Optional numeric bounds (inclusive) for number/currency fields. */
  min?: number;
  max?: number;
  /** For type "reference": the table to pull options from. */
  refTable?: string;
  /**
   * For type "reference": restrict the referenced table to rows matching
   * column = value (e.g. lookup_options filtered to one list_key). Options
   * for two fields on the same refTable but different refFilter values are
   * cached separately (keyed by field name, not table name) — see
   * EntityManager's RefMap.
   */
  refFilter?: { column: string; value: string };
  /** For type "reference": builds the option label from a referenced row. */
  refLabel?: (row: Record<string, unknown>) => string;
  placeholder?: string;
  /** Value pre-filled when creating a new record. */
  defaultValue?: unknown;
  /** Computed by the database (generated column). Shown but never submitted. */
  readOnly?: boolean;
  /**
   * For a readOnly field: derive its displayed value live from the other
   * fields on the same row, instead of showing the row's persisted value.
   * Meant for a line-item field whose real value is a DB-generated column
   * (e.g. bill_of_materials_lines.estimated_total_cost = quantity *
   * estimated_unit_cost) — the generated value isn't known until after save,
   * but a live preview while editing is worth more than "Auto-calculated on
   * save" for a plain multiplication the client can just as well do itself.
   */
  compute?: (row: Record<string, unknown>) => unknown;
  /** Show in the list table (default: false). */
  inList?: boolean;
  /** Render as a status/priority badge in the list. */
  badge?: boolean;
  /** Optional grouping heading in the form. */
  section?: string;
  help?: string;
}

/**
 * Optional child-table "line items" editable inline in this entity's create/
 * edit modal — a freeform, dynamically-added-and-removed list of rows in a
 * separate table pointing back at this entity (e.g. a Bill of Materials'
 * parts list: each row its own Part, Category, Quantity, and Unit Cost — a
 * different set of parts on every BOM, not a fixed column per part).
 * Distinct from a "reference" field, which points *at* one other row; this
 * points *from* many rows back at one parent.
 */
export interface LineItemsConfig {
  /** Child table, e.g. "bill_of_materials_lines". */
  table: string;
  /** FK column on the child table pointing back at this entity's id. */
  parentColumn: string;
  /** Section heading shown above the line-item rows in the modal. */
  label: string;
  /** Button label for adding a new blank line (default: "+ Add line"). */
  addLabel?: string;
  /**
   * Columns editable per line. Reuses FieldDef; `badge` is ignored (line
   * items never render as a table row). `readOnly` (optionally paired with
   * `compute`) shows a disabled display box instead of an input, same idea
   * as the top-level form's ReadOnlyField.
   */
  fields: FieldDef[];
  /** Default values for a newly-added blank line. */
  emptyLine: () => Record<string, unknown>;
  /**
   * Optional: name of a field (in `fields`, typically `readOnly` with a
   * `compute`) whose value, summed across every line, is shown as a total
   * beneath the list — e.g. a BOM's per-line Extended Cost rolled up into an
   * overall estimated total. Omit for line items with nothing worth totaling
   * (e.g. a requisition's per-line notes).
   */
  totalField?: string;
  /** Label for the totalField sum (default: "Total"). */
  totalLabel?: string;
  /**
   * Optional: lines to pre-populate when creating a brand-new parent row
   * (e.g. a fresh entity starting with a standard set of lines already
   * listed, instead of empty). Ignored when editing an existing row —
   * those load their real saved lines instead. Pre-populated lines have no
   * `id` yet, so they save as fresh inserts exactly like a manually-added
   * line.
   */
  defaultLines?: () => Record<string, unknown>[];
  /**
   * Optional: lets a saved line be "converted" into a row of another entity
   * (e.g. a Bill of Materials line becomes a Procurement Item once the BOM
   * is approved). `linkColumn` is the column on *this* child table that
   * stores the created row's id, so conversion is idempotent — a line whose
   * linkColumn is already set is skipped on the next run, and only
   * already-saved lines (with an `id`) are eligible in the first place.
   */
  convertTo?: {
    /** Key of the target entity in ENTITIES_BY_KEY (e.g. "items"). */
    entityKey: string;
    /** Column on the line-items table that stores the created row's id. */
    linkColumn: string;
    /** Label for the button that triggers conversion. */
    buttonLabel: string;
    /**
     * Build the new row's values from this line and its parent row. Given
     * the Supabase client so it can resolve things that aren't on the line
     * itself, e.g. a sensible default status_id (a lookup_options id can't
     * be hardcoded here — it's generated per-environment).
     */
    mapLine: (
      line: Record<string, unknown>,
      parent: Record<string, unknown>,
      supabase: SupabaseClient,
    ) => Record<string, unknown> | Promise<Record<string, unknown>>;
    /**
     * When true, every pending line converts into ONE shared target row
     * instead of one row each — e.g. a Bill of Materials' parts list all
     * belongs to the same Asset Request, and procurement_items is one row
     * per Asset Request (migration 0038), so "Generate" should never create
     * more than one Procurement Item per BOM no matter how many parts are
     * listed. If any line already has `linkColumn` set, that existing target
     * is reused (and `mapLine` isn't called again); otherwise exactly one
     * target row is created — using the first pending line to build its
     * values — and every pending line is linked to it.
     */
    singleTargetPerParent?: boolean;
  };
}

export interface EntityConfig {
  /** Route key, e.g. "budgets". */
  key: string;
  /** Postgres table name. */
  table: string;
  /** Singular + plural display names. */
  singular: string;
  plural: string;
  /** Module the entity belongs to. */
  module: "capex" | "procurement" | "monitoring";
  breadcrumb: string;
  fields: FieldDef[];
  /** Optional child-table line items, added/removed dynamically in the modal. */
  lineItems?: LineItemsConfig;
  /** Column shown as the primary label in lists (usually "code" or "title"). */
  primaryField: string;
  /**
   * Builds the human-readable code for a new row from its form values.
   * Omit for tables with no `code` column (e.g. shared reference data like
   * `vendors`) — createRow() skips the code entirely when this is unset.
   */
  makeCode?: (supabase: SupabaseClient, values: Record<string, unknown>) => Promise<string>;
  /**
   * Set for shared reference-data tables with no `owner_id` column (e.g.
   * `vendors` — writes are open to any authenticated user, not owner-scoped,
   * see supabase/migrations/0014_normalize_vendor_entity.sql). createRow()
   * skips stamping owner_id entirely when this is true.
   */
  noOwner?: boolean;
  /**
   * Name of a `reference` field (pointing at `lookup_options`, e.g.
   * "status_id") whose value can be "terminal" (see lookup_options.is_terminal
   * — a Received/Cancelled-style final state). Once a row's value for this
   * field points at a terminal option, EntityManager treats the row as
   * permanently locked: Edit/Delete become View-only in the list, and the
   * edit modal opens read-only. The real enforcement is a matching database
   * trigger (belt-and-suspenders, same convention as `canEdit`/RLS above) —
   * this only keeps the UI from offering an action the database will reject.
   */
  lockWhenTerminal?: string;
  /**
   * Overrides the edit/create modal's width (CSS length, e.g. "1200px").
   * Omit to use the default: 560px, or -- for an entity with `lineItems` --
   * a width computed from the line-item column count (see EntityManager's
   * modal `width` prop). Set this when that computed width still feels
   * cramped for how much content the fields (top-level or per-line) actually
   * carry, e.g. long free-text columns.
   */
  modalWidth?: string;
  /**
   * Read-only "what points at this record" list, shown in the edit modal
   * for an existing row. For a many-to-one relationship stored as a
   * `reference` field on the *other* entity (e.g. Procurement Item's own
   * "Requisition" field, migration 0047) there's otherwise no way to see,
   * from the "one" side, which rows on the "many" side currently point back
   * at it — unlike `lineItems`, which owns a dedicated child table edited
   * inline, this is a plain reverse lookup: fetch `table` where `column`
   * equals this row's id, and just list them (view-only, click through to
   * that module to actually edit one).
   */
  reverseLookup?: {
    /** Table to query, e.g. "procurement_items". */
    table: string;
    /** Column on that table holding this row's id, e.g. "requisition_id". */
    column: string;
    /** Section heading shown above the list in the modal. */
    label: string;
    /** Key of the target entity in ENTITIES_BY_KEY, e.g. "items" — used to build a link to that module's list. */
    entityKey: string;
    /** Builds each listed row's label from its own columns (plain select "*", no joins — same constraint as refLabel). */
    refLabel: (row: Record<string, unknown>) => string;
    /**
     * Lets an editor pick an unlinked row (`column` is null) from a dropdown
     * and link it here — sets `column` = this row's id — plus unlink any
     * already-listed row back to null. Off by default (view-only) since not
     * every reverse lookup should be editable from this side.
     */
    editable?: boolean;
  };
}
