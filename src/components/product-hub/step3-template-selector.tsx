"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TEMPLATES, type TemplateId } from "@/lib/types";

interface Step3TemplateSelectorProps {
  selectedTemplates: TemplateId[];
  generating: boolean;
  onChange: (templates: TemplateId[]) => void;
  onBack: () => void;
  onGenerate: () => void;
}

export function Step3TemplateSelector({
  selectedTemplates, generating, onChange, onBack, onGenerate
}: Step3TemplateSelectorProps) {
  function toggle(id: TemplateId) {
    onChange(
      selectedTemplates.includes(id)
        ? selectedTemplates.filter(t => t !== id)
        : [...selectedTemplates, id]
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold">Select Output Templates</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Choose one or more documents to generate. Each will be a separate tab in the output view.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TEMPLATES.map(t => {
          const selected = selectedTemplates.includes(t.id);
          return (
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              disabled={generating}
              className={cn(
                "text-left p-4 rounded-lg border-2 transition-all space-y-1",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/20 hover:border-primary/40 bg-background",
                generating && "opacity-50 cursor-not-allowed",
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{t.name}</p>
                <div className={cn(
                  "h-4 w-4 rounded border-2 flex-shrink-0 transition-colors",
                  selected ? "bg-primary border-primary" : "border-muted-foreground/40",
                )} />
              </div>
              <p className="text-[11px] text-primary/70 font-medium">{t.audience}</p>
              <p className="text-xs text-muted-foreground">{t.description}</p>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={onBack} disabled={generating}>← Back</Button>
        <Button
          onClick={onGenerate}
          disabled={selectedTemplates.length === 0 || generating}
          className="min-w-36"
        >
          {generating ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</>
          ) : (
            `Generate ${selectedTemplates.length > 0 ? `(${selectedTemplates.length})` : ''}`
          )}
        </Button>
      </div>
    </div>
  );
}
