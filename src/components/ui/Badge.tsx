import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/constants";

/**
 * `value` picks the color class (`badge-${value}`, matched against the
 * kebab-case status/severity keys styled in globals.css). `label` is the
 * text shown, which may differ from `value` — e.g. a lookup_options-backed
 * status renders as "Under Evaluation" (label) styled as badge-under-evaluation
 * (value). Omit `label` to fall back to the old behavior (STATUS_LABELS[value]
 * ?? value).
 */
export function Badge({ value, label }: { value: string; label?: string }) {
  return (
    <span className={cn("badge", `badge-${value}`)}>
      {label ?? STATUS_LABELS[value] ?? value}
    </span>
  );
}
