import type { FieldDef } from "./types";

const CURRENCY_RE = /^[A-Z]{3}$/;

/** Validate a single field value. Returns an error message, or null if valid. */
export function validateField(field: FieldDef, value: unknown): string | null {
  if (field.readOnly) return null;

  const empty = value === undefined || value === null || value === "";

  if (field.required && empty) return `${field.label} is required`;
  if (empty) return null;

  if (field.type === "number" || field.type === "currency") {
    const n = Number(value);
    if (Number.isNaN(n)) return `${field.label} must be a number`;
    if (field.type === "currency" && n < 0) return `${field.label} cannot be negative`;
    if (field.min !== undefined && n < field.min) return `${field.label} must be at least ${field.min}`;
    if (field.max !== undefined && n > field.max) return `${field.label} must be at most ${field.max}`;
  }

  if (field.name === "currency" && typeof value === "string" && !CURRENCY_RE.test(value)) {
    return "Currency must be a 3-letter ISO code (e.g. PHP)";
  }

  if (field.type === "date") {
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return `${field.label} is not a valid date`;
  }

  return null;
}

/** Validate all fields; returns a list of error messages (empty if all valid). */
export function validateValues(
  fields: FieldDef[],
  values: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  for (const field of fields) {
    const error = validateField(field, values[field.name]);
    if (error) errors.push(error);
  }
  return errors;
}
