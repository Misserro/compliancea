"use client";

import { useState, useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OutputSection } from "./output-section";
import { GapQaPanel } from "./gap-qa-panel";
import { TEMPLATES, TEMPLATE_SECTIONS, type TemplateId, type GeneratedOutputs } from "@/lib/types";

interface QuestionSuggestion {
  question: string;
  suggestions: string[];
}

interface Step4OutputViewerProps {
  selectedTemplates: TemplateId[];
  outputs: GeneratedOutputs;
  streamingTemplate: TemplateId | null;
  streamingRawText?: Record<TemplateId, string>;
  gapSuggestions: Record<TemplateId, QuestionSuggestion[]>;
  loadingSuggestions: Record<TemplateId, boolean>;
  submittingAnswers: boolean;
  onRegenerate: (template: TemplateId, section?: string) => void;
  onOutputChange: (template: TemplateId, sectionId: string, content: string) => void;
  onRegenerateAll: () => void;
  onAnswerGaps: (template: TemplateId, answers: { question: string; answer: string }[]) => void;
}

export function Step4OutputViewer({
  selectedTemplates, outputs, streamingTemplate, streamingRawText,
  gapSuggestions, loadingSuggestions, submittingAnswers,
  onRegenerate, onOutputChange, onRegenerateAll, onAnswerGaps,
}: Step4OutputViewerProps) {
  const [activeTab, setActiveTab] = useState<TemplateId>(selectedTemplates[0]);

  // Re-sync active tab if it's no longer in selectedTemplates (e.g. after template set changes)
  useEffect(() => {
    if (!selectedTemplates.includes(activeTab)) {
      setActiveTab(selectedTemplates[0]);
    }
  }, [selectedTemplates, activeTab]);

  const templateDef = TEMPLATES.find(t => t.id === activeTab);
  const sections = TEMPLATE_SECTIONS[activeTab] ?? [];
  const templateOutput = outputs[activeTab];
  const isStreaming = streamingTemplate === activeTab;
  const gaps = templateOutput?.gaps ?? [];

  return (
    <div className="space-y-4">
      {/* Tab bar + Regenerate All */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 border-b flex-1" role="tablist">
          {selectedTemplates.map(tid => {
            const def = TEMPLATES.find(t => t.id === tid);
            const hasGaps = (outputs[tid]?.gaps?.length ?? 0) > 0;
            return (
              <button
                key={tid}
                type="button"
                onClick={() => setActiveTab(tid)}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  activeTab === tid
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                role="tab"
                aria-selected={activeTab === tid}
              >
                {def?.name ?? tid}
                {streamingTemplate === tid && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                )}
                {hasGaps && streamingTemplate !== tid && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" role="img" aria-label="has open questions" />
                )}
              </button>
            );
          })}
        </div>
        <Button variant="outline" size="sm" onClick={onRegenerateAll} disabled={!!streamingTemplate}>
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" /> Regenerate All
        </Button>
      </div>

      {/* Active template content */}
      {isStreaming && !templateOutput ? (
        // Skeleton loader — shows section structure while AI generates
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
            Generating {templateDef?.name}…
          </p>
          {sections.map(section => (
            <div key={section.id} className="border rounded-lg overflow-hidden bg-card animate-pulse">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/20">
                <div className="h-4 w-4 rounded bg-muted-foreground/20" />
                <div className="h-3.5 w-32 rounded bg-muted-foreground/20" />
              </div>
              <div className="px-4 py-3 space-y-2">
                <div className="h-3 w-full rounded bg-muted-foreground/10" />
                <div className="h-3 w-5/6 rounded bg-muted-foreground/10" />
                <div className="h-3 w-4/6 rounded bg-muted-foreground/10" />
              </div>
            </div>
          ))}
        </div>
      ) : templateOutput ? (
        <>
          <div className="space-y-3">
            {sections.map(section => (
              <OutputSection
                key={section.id}
                sectionId={section.id}
                label={section.label}
                content={templateOutput.sections[section.id] ?? ''}
                streaming={isStreaming}
                gaps={templateOutput.gaps ?? []}
                onRegenerate={(sid) => onRegenerate(activeTab, sid)}
                onChange={(sid, content) => onOutputChange(activeTab, sid, content)}
              />
            ))}
          </div>

          {/* Q&A panel — only shown when there are gaps */}
          {gaps.length > 0 && (
            <GapQaPanel
              gaps={gaps}
              suggestions={gapSuggestions[activeTab] ?? []}
              loadingSuggestions={loadingSuggestions[activeTab] ?? false}
              onSubmit={(answers) => onAnswerGaps(activeTab, answers)}
              submitting={submittingAnswers}
            />
          )}
        </>
      ) : (
        <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
          No output yet. Click Generate in Step 3.
        </div>
      )}
    </div>
  );
}
