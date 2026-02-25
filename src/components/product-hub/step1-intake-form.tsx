"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { IntakeForm } from "@/lib/types";

const EMPTY_INTAKE: IntakeForm = {
  sectionA: { problemStatement: '', persona: '', statusQuo: '', whyNow: '' },
  sectionB: { featureDescription: '', userFlow: '', outOfScope: '', acceptanceCriteria: '' },
  sectionC: { constraints: '', kpis: '', systems: '', mustHave: '', shouldHave: '', niceToHave: '' },
};

interface TextareaFieldProps {
  label: string;
  value: string;
  required?: boolean;
  error?: string;
  rows?: number;
  onChange: (v: string) => void;
}

function TextareaField({ label, value, required, error, rows = 3, onChange }: TextareaFieldProps) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className={cn(
          "w-full rounded-md border bg-background px-3 py-2 text-sm resize-y",
          "focus:outline-none focus:ring-2 focus:ring-ring",
          error && "border-destructive focus:ring-destructive",
        )}
      />
      <div className="flex justify-between items-start">
        {error ? <p className="text-xs text-destructive">{error}</p> : <span />}
        <span className="text-xs text-muted-foreground ml-auto">{value.length} chars</span>
      </div>
    </div>
  );
}

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ title, subtitle, defaultOpen = true, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <div>
          <p className="text-sm font-medium">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </button>
      {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

interface Step1IntakeFormProps {
  value: IntakeForm;
  onChange: (intake: IntakeForm) => void;
  onContinue: () => void;
}

export function Step1IntakeForm({ value, onChange, onContinue }: Step1IntakeFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function updateA(field: keyof IntakeForm['sectionA'], v: string) {
    onChange({ ...value, sectionA: { ...value.sectionA, [field]: v } });
    if (errors[`A_${field}`]) setErrors(e => { const n = { ...e }; delete n[`A_${field}`]; return n; });
  }
  function updateB(field: keyof IntakeForm['sectionB'], v: string) {
    onChange({ ...value, sectionB: { ...value.sectionB, [field]: v } });
    if (errors[`B_${field}`]) setErrors(e => { const n = { ...e }; delete n[`B_${field}`]; return n; });
  }
  function updateC(field: keyof IntakeForm['sectionC'], v: string) {
    onChange({ ...value, sectionC: { ...value.sectionC, [field]: v } });
    if (errors[`C_${field}`]) setErrors(e => { const n = { ...e }; delete n[`C_${field}`]; return n; });
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!value.sectionA.problemStatement.trim()) e.A_problemStatement = 'Required';
    if (!value.sectionA.persona.trim()) e.A_persona = 'Required';
    if (!value.sectionA.statusQuo.trim()) e.A_statusQuo = 'Required';
    if (!value.sectionB.featureDescription.trim()) e.B_featureDescription = 'Required';
    if (!value.sectionB.userFlow.trim()) e.B_userFlow = 'Required';
    if (!value.sectionB.acceptanceCriteria.trim()) e.B_acceptanceCriteria = 'Required';
    if (!value.sectionC.kpis.trim()) e.C_kpis = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleContinue() {
    if (validate()) onContinue();
  }

  return (
    <div className="space-y-4">
      <CollapsibleSection title="Section A: Problem & Context" subtitle="Describe the problem this feature solves">
        <TextareaField label="What problem does this feature solve?" required value={value.sectionA.problemStatement} error={errors.A_problemStatement} onChange={(v) => updateA('problemStatement', v)} rows={3} />
        <TextareaField label="Who has this problem? (persona / department / role)" required value={value.sectionA.persona} error={errors.A_persona} onChange={(v) => updateA('persona', v)} rows={2} />
        <TextareaField label="What happens today without this feature?" required value={value.sectionA.statusQuo} error={errors.A_statusQuo} onChange={(v) => updateA('statusQuo', v)} rows={3} />
        <TextareaField label="Why are we solving this now?" value={value.sectionA.whyNow} onChange={(v) => updateA('whyNow', v)} rows={2} />
      </CollapsibleSection>

      <CollapsibleSection title="Section B: Feature Definition" subtitle="Define what the feature does and how it works">
        <TextareaField label="What does this feature do? (1–2 sentences)" required value={value.sectionB.featureDescription} error={errors.B_featureDescription} onChange={(v) => updateB('featureDescription', v)} rows={2} />
        <TextareaField label="What steps does the user take to use it? (describe the flow)" required value={value.sectionB.userFlow} error={errors.B_userFlow} onChange={(v) => updateB('userFlow', v)} rows={4} />
        <TextareaField label="What is explicitly OUT of scope?" value={value.sectionB.outOfScope} onChange={(v) => updateB('outOfScope', v)} rows={2} />
        <TextareaField label="What are the acceptance criteria? (when is this 'done'?)" required value={value.sectionB.acceptanceCriteria} error={errors.B_acceptanceCriteria} onChange={(v) => updateB('acceptanceCriteria', v)} rows={4} />
      </CollapsibleSection>

      <CollapsibleSection title="Section C: Constraints & Success Metrics" subtitle="Define how success is measured">
        <TextareaField label="Are there technical, legal, or budget constraints?" value={value.sectionC.constraints} onChange={(v) => updateC('constraints', v)} rows={2} />
        <TextareaField label="What KPIs or success metrics should this feature achieve?" required value={value.sectionC.kpis} error={errors.C_kpis} onChange={(v) => updateC('kpis', v)} rows={3} />
        <TextareaField label="Which systems or integrations must be considered?" value={value.sectionC.systems} onChange={(v) => updateC('systems', v)} rows={2} />
        <div className="space-y-2">
          <Label className="text-xs font-medium">Prioritize requirements (MoSCoW)</Label>
          <div className="grid grid-cols-3 gap-3">
            {([['mustHave', 'Must Have'], ['shouldHave', 'Should Have'], ['niceToHave', 'Nice to Have']] as const).map(([field, label]) => (
              <div key={field} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <textarea
                  value={value.sectionC[field]}
                  onChange={(e) => updateC(field, e.target.value)}
                  rows={4}
                  placeholder={`List ${label.toLowerCase()} requirements...`}
                  className="w-full rounded-md border bg-background px-3 py-2 text-xs resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            ))}
          </div>
        </div>
      </CollapsibleSection>

      <div className="flex justify-end">
        <Button onClick={handleContinue}>Continue to Document Context →</Button>
      </div>
    </div>
  );
}

export { EMPTY_INTAKE };
