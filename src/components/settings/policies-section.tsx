"use client";

import { DOC_TYPES } from "@/lib/constants";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface PoliciesSectionProps {
  selectedTypes: string[];
  onChange: (types: string[]) => void;
}

export function PoliciesSection({ selectedTypes, onChange }: PoliciesSectionProps) {
  function toggle(type: string) {
    if (selectedTypes.includes(type)) {
      onChange(selectedTypes.filter((t) => t !== type));
    } else {
      onChange([...selectedTypes, type]);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Policies Tab — Document Types</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Select which document types appear in the Policies tab.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {DOC_TYPES.map((type) => (
          <div key={type} className="flex items-center gap-2">
            <Checkbox
              id={`policy-type-${type}`}
              checked={selectedTypes.includes(type)}
              onCheckedChange={() => toggle(type)}
            />
            <Label htmlFor={`policy-type-${type}`} className="text-sm capitalize cursor-pointer">
              {type}
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
}
