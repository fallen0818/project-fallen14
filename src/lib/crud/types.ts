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
 * separate table pointing back at this entity (e.g. a procurement item's
 * bidding schedule: Pre-bid Conference, Opening of Bids, Post-qualification,
 * Award — a different set of activities on every item, not a fixed column
 * per activity). Distinct from a "reference" field, which points *at* one
 * other row; this points *from* many rows back at one parent.
 */
export interface LineItemsConfig {
  /** Child table, e.g. "bidding_schedule_activities". */
  table: string;
  /** FK column on the child table pointing back at this entity's id. */
  parentColumn: string;
  /** Section heading shown above the line-item rows in the modal. */
  label: string;
  /** Button label for adding a new blank line (default: "+ Add line"). */
  addLabel?: string;
  /** Columns editable per line. Reuses FieldDef; readOnly/refFilter/badge are ignored here. */
  fields: FieldDef[];
  /** Default values for a newly-added blank line. */
  emptyLine: () => Record<string, unknown>;
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
}
