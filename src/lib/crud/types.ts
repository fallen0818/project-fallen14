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
  /** Column shown as the primary label in lists (usually "code" or "title"). */
  primaryField: string;
  /** Builds the human-readable code for a new row from its form values. */
  makeCode: (supabase: SupabaseClient, values: Record<string, unknown>) => Promise<string>;
}
