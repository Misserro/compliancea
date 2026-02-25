"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OutputSection } from "./output-section";
import { TEMPLATES, TEMPLATE_SECTIONS, type TemplateId, type GeneratedOutputs } from "@/lib/types";

interface Step4OutputViewerProps {
  selectedTemplates: TemplateId[];
  outputs: GeneratedOutputs;
  streamingTemplate: TemplateId | null;
  streamingRawText: Record<TemplateId, string>;
  onRegenerate: (template: TemplateId, section?: string) => void;
  onOutputChange: (template: TemplateId, sectionId: string, content: string) => void;
  onRegenerateAll: () => void;
}

export function Step4OutputViewer({
  selectedTemplates, outputs, streamingTemplate, streamingRawText,
  onRegenerate, onOutputChange, onRegenerateAll,
}: Step4OutputViewerProps) {
  const [activeTab, setActiveTab] = useState<TemplateId>(selectedTemplates[0]);

  const templateDef = TEMPLATES.find(t => t.id === activeTab);
  const sections = TEMPLATE_SECTIONS[activeTab] ?? [];
  const templateOutput = outputs[activeTab];
  const isStreaming = streamingTemplate === activeTab;
  const rawText = streamingRawText[activeTab] ?? '';

  return (
    <div className="space-y-4">
      {/* Tab bar + Regenerate All */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 border-b flex-1">
          {selectedTemplates.map(tid => {
            const def = TEMPLATES.find(t => t.id === tid);
            return (
              <button
                key={tid}
                onClick={() => setActiveTab(tid)}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  activeTab === tid
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {def?.name ?? tid}
                {streamingTemplate === tid && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
        <Button variant="outline" size="sm" onClick={onRegenerateAll} disabled={!!streamingTemplate}>
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Regenerate All
        </Button>
      </div>

      {/* Active template content */}
      {isStreaming && !templateOutput ? (
        // Raw streaming view before first template_complete
        <div className="border rounded-lg p-4 bg-muted/20 min-h-[200px]">
          <p className="text-xs text-muted-foreground mb-2 font-medium">Generating {templateDef?.name}…</p>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{rawText}</pre>
        </div>
      ) : templateOutput ? (
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
      ) : (
        <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
          No output yet. Click Generate in Step 3.
        </div>
      )}
    </div>
  );
}
