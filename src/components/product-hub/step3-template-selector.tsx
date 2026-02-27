"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TEMPLATES, type TemplateId, type IntakeForm } from "@/lib/types";

interface Step3TemplateSelectorProps {
  selectedTemplates: TemplateId[];
  generating: boolean;
  intakeForm: IntakeForm;
  onChange: (templates: TemplateId[]) => void;
  onBack: () => void;
  onGenerate: () => void;
}

function getMissingFields(intake: IntakeForm): string[] {
  const missing: string[] = [];
  if (!intake.sectionA.problemStatement?.trim()) missing.push('Problem Statement');
  if (!intake.sectionB.featureDescription?.trim()) missing.push('Feature Description');
  if (!intake.sectionC.kpis?.trim()) missing.push('Success Metrics (KPIs)');
  return missing;
}

export function Step3TemplateSelector({
  selectedTemplates, generating, intakeForm, onChange, onBack, onGenerate
}: Step3TemplateSelectorProps) {
  function toggle(id: TemplateId) {
    onChange(
      selectedTemplates.includes(id)
        ? selectedTemplates.filter(t => t !== id)
        : [...selectedTemplates, id]
    );
  }

  const missingFields = getMissingFields(intakeForm);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold">Select Output Templates</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Choose one or more documents to generate. Each will be a separate tab in the output view.
        </p>
      </div>

      {/* Completeness warning */}
      {missingFields.length > 0 && (
        <div className="flex gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-medium">Incomplete intake form</p>
            <p className="text-xs mt-0.5 text-amber-700 dark:text-amber-400">
              These fields are empty and may produce incomplete output:{' '}
              <span className="font-medium">{missingFields.join(', ')}</span>.
            </p>
            <button
              onClick={onBack}
              className="text-xs mt-1 underline underline-offset-2 hover:no-underline"
            >
              Go back to fill them
            </button>
          </div>
        </div>
      )}

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
