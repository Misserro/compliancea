"use client";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { FEATURE_STATUSES, STATUS_LABELS, STATUS_COLORS, type FeatureStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: FeatureStatus;
  editable?: boolean;
  onChange?: (status: FeatureStatus) => void;
}

export function StatusBadge({ status, editable = false, onChange }: StatusBadgeProps) {
  const label = STATUS_LABELS[status] ?? status;
  const color = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700';

  if (!editable) {
    return (
      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", color)}>
        {label}
      </span>
    );
  }

  return (
    <Select value={status} onValueChange={(v) => onChange?.(v as FeatureStatus)}>
      <SelectTrigger className="h-auto border-0 p-0 shadow-none focus:ring-0 w-auto">
        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer", color)}>
          {label}
        </span>
      </SelectTrigger>
      <SelectContent>
        {FEATURE_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[s])}>
              {STATUS_LABELS[s]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
