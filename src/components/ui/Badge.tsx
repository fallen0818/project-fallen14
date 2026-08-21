import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/constants";

/**
 * `value` picks the color class (`badge-${value}`, matched against the
 * kebab-case status/severity keys styled in globals.css). `label` is the
 * text shown, which may differ from `value` — e.g. a lookup_options-backed
 * status renders as "Under Evaluation" (label) styled as badge-under-evaluation
 * (value). Omit `label` to fall back to the old behavior (STATUS_LABELS[value]
 * ?? value).
 *
 * `tone` (lookup_options.tone: success/warning/error/info/neutral) takes
 * priority over the value-derived class when set — this is what lets a
 * user-managed lookup_options row (see EntityManager's "Manage" control)
 * actually pick its own color, instead of needing a matching badge-<value>
 * rule hand-added to globals.css for every new status text.
 */
export function Badge({ value, label, tone }: { value: string; label?: string; tone?: string | null }) {
  return (
    <span className={cn("badge", tone ? `badge-tone-${tone}` : `badge-${value}`)}>
      {label ?? STATUS_LABELS[value] ?? value}
    </span>
  );
}
