"use client";

import { Progress } from "@/components/ui/progress";

export interface ProcessingProgress {
  active: boolean;
  current: number;
  total: number;
  currentName: string;
}

interface ProcessingProgressContentProps {
  processingProgress: ProcessingProgress;
  label: string;
}

/**
 * Pure inner component — renders only the progress label + bar.
 * No fixed-position wrapper. Use inside your own container.
 */
export function ProcessingProgressContent({
  processingProgress,
  label,
}: ProcessingProgressContentProps) {
  const progressPercent =
    processingProgress.total > 0
      ? Math.round(
          (processingProgress.current / processingProgress.total) * 100
        )
      : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{progressPercent}%</span>
      </div>
      <Progress value={progressPercent} />
    </div>
  );
}

interface ProcessingProgressBarProps {
  processingProgress: ProcessingProgress | null;
  label: string;
}

/**
 * Standalone progress bar with fixed-bottom container + slide animation.
 * Use on pages that don't have their own fixed-bottom action bar (e.g. documents library).
 */
export function ProcessingProgressBar({
  processingProgress,
  label,
}: ProcessingProgressBarProps) {
  const isVisible = processingProgress?.active === true;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out ${
        isVisible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="mx-auto max-w-4xl px-4 pb-4">
        <div className="rounded-lg border bg-background shadow-lg p-4">
          {processingProgress && (
            <ProcessingProgressContent
              processingProgress={processingProgress}
              label={label}
            />
          )}
        </div>
      </div>
    </div>
  );
}
