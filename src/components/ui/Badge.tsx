import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/constants";

export function Badge({ value }: { value: string }) {
  return (
    <span className={cn("badge", `badge-${value}`)}>
      {STATUS_LABELS[value] ?? value}
    </span>
  );
}
