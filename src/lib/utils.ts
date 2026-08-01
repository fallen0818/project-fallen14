/** Join class names, dropping falsy values. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Format a number as Philippine Peso currency. */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Format a percentage with one decimal. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toFixed(1)}%`;
}

/** Format an ISO date string as a short human date. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Escape a single CSV field.
 * Neutralises spreadsheet formula injection by prefixing a leading
 * =, +, -, @, tab or CR with a single quote before quoting.
 */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str = String(value);

  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (/[",\n\r]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Build a CSV string from rows of records, given an ordered header list. */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  headers: { key: keyof T; label: string }[],
): string {
  const headerLine = headers.map((h) => escapeCsvValue(h.label)).join(",");
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCsvValue(row[h.key])).join(","),
  );
  return [headerLine, ...dataLines].join("\n");
}

/** Trigger a client-side download of text content as a file. */
export function downloadFile(content: string, filename: string, mime = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
