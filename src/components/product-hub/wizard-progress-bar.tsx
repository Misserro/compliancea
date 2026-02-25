"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IntakeForm } from "@/lib/types";

interface WizardProgressBarProps {
  currentStep: number;
  intakeFormJson?: string | null;
  onStepClick?: (step: number) => void;
}

const STEPS = [
  { number: 1, label: 'Intake Form' },
  { number: 2, label: 'Document Context' },
  { number: 3, label: 'Generate' },
  { number: 4, label: 'Output' },
];

function isIntakeComplete(intakeFormJson: string | null | undefined): boolean {
  if (!intakeFormJson) return false;
  try {
    const f = JSON.parse(intakeFormJson) as IntakeForm;
    return !!(
      f.sectionA?.problemStatement?.trim() &&
      f.sectionA?.persona?.trim() &&
      f.sectionA?.statusQuo?.trim() &&
      f.sectionB?.featureDescription?.trim() &&
      f.sectionB?.userFlow?.trim() &&
      f.sectionB?.acceptanceCriteria?.trim() &&
      f.sectionC?.kpis?.trim()
    );
  } catch { return false; }
}

export function WizardProgressBar({ currentStep, intakeFormJson, onStepClick }: WizardProgressBarProps) {
  const completedSteps = new Set<number>();
  if (isIntakeComplete(intakeFormJson)) completedSteps.add(1);

  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, i) => {
        const isActive = currentStep === step.number;
        const isCompleted = completedSteps.has(step.number);
        const isPast = step.number < currentStep;

        return (
          <div key={step.number} className="flex items-center flex-1 last:flex-none">
            <button
              onClick={() => onStepClick?.(step.number)}
              disabled={!onStepClick}
              className={cn(
                "flex flex-col items-center gap-1 min-w-0",
                onStepClick && "cursor-pointer",
              )}
            >
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors",
                isActive && "border-primary bg-primary text-primary-foreground",
                (isCompleted || isPast) && !isActive && "border-primary bg-primary/10 text-primary",
                !isActive && !isCompleted && !isPast && "border-muted-foreground/30 text-muted-foreground",
              )}>
                {isCompleted && !isActive ? <Check className="h-4 w-4" /> : step.number}
              </div>
              <span className={cn(
                "text-xs whitespace-nowrap",
                isActive ? "text-foreground font-medium" : "text-muted-foreground",
              )}>
                {step.label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={cn(
                "flex-1 h-0.5 mx-2 mb-5 transition-colors",
                isPast || isCompleted ? "bg-primary" : "bg-muted-foreground/20",
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
