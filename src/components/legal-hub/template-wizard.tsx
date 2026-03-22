"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PREDEFINED_BLUEPRINTS,
  SECTION_VARIABLE_HINTS,
  ALL_VARIABLE_TOKENS,
  combineWizardSections,
  type PredefinedBlueprint,
  type WizardSection,
} from "@/lib/wizard-blueprints";

interface CustomBlueprint {
  id: number;
  name: string;
  sections_json: string;
}

interface TemplateWizardProps {
  onComplete: (html: string) => void;
  onCancel: () => void;
}

type WizardStep = "blueprint" | number;

export function TemplateWizard({ onComplete, onCancel }: TemplateWizardProps) {
  const [step, setStep] = useState<WizardStep>("blueprint");
  const [customBlueprints, setCustomBlueprints] = useState<CustomBlueprint[]>(
    []
  );
  const [loadingCustom, setLoadingCustom] = useState(true);
  const [sections, setSections] = useState<WizardSection[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const fetchCustom = async () => {
      try {
        const res = await fetch("/api/legal-hub/wizard/blueprints");
        if (res.ok) {
          const data = await res.json();
          setCustomBlueprints(data.blueprints || []);
        }
      } catch {
        // Non-fatal — predefined blueprints still available
      } finally {
        setLoadingCustom(false);
      }
    };
    fetchCustom();
  }, []);

  const selectBlueprint = useCallback(
    (
      blueprintSections: Array<{
        title: string;
        sectionKey: string | null;
        variableHintKeys?: string[];
      }>
    ) => {
      if (blueprintSections.length === 0) {
        // Blank blueprint — go straight to form with empty content
        onComplete("");
        return;
      }
      const initialized: WizardSection[] = blueprintSections.map((s) => ({
        title: s.title,
        sectionKey: s.sectionKey,
        variableHintKeys:
          s.variableHintKeys ??
          (s.sectionKey
            ? SECTION_VARIABLE_HINTS[s.sectionKey] ?? ALL_VARIABLE_TOKENS
            : ALL_VARIABLE_TOKENS),
        content: "",
      }));
      setSections(initialized);
      setStep(0);
    },
    [onComplete]
  );

  const selectPredefined = useCallback(
    (blueprint: PredefinedBlueprint) => {
      selectBlueprint(blueprint.sections);
    },
    [selectBlueprint]
  );

  const selectCustom = useCallback(
    (blueprint: CustomBlueprint) => {
      let parsed: Array<{
        title: string;
        sectionKey: string | null;
        variableHintKeys?: string[];
      }> = [];
      try {
        parsed = JSON.parse(blueprint.sections_json);
      } catch {
        parsed = [];
      }
      selectBlueprint(parsed);
    },
    [selectBlueprint]
  );

  const updateContent = (index: number, content: string) => {
    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, content } : s))
    );
  };

  const insertTokenAtCursor = (index: number, token: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    textarea.setRangeText(token, start, end, "end");
    updateContent(index, textarea.value);
    textarea.focus();
  };

  const handleNext = () => {
    if (typeof step === "number" && step < sections.length - 1) {
      setStep(step + 1);
    }
  };

  const handlePrev = () => {
    if (typeof step === "number") {
      if (step > 0) {
        setStep(step - 1);
      } else {
        setStep("blueprint");
      }
    }
  };

  const handleFinish = () => {
    const html = combineWizardSections(
      sections.map((s) => ({ title: s.title, content: s.content }))
    );
    onComplete(html);
  };

  // -- Blueprint selection step -----------------------------------------------
  if (step === "blueprint") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-muted-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to list
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Choose a Blueprint</h2>
            <p className="text-sm text-muted-foreground">
              Select a structure to guide you through filling in sections
            </p>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Predefined
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {PREDEFINED_BLUEPRINTS.map((bp) => (
              <button
                key={bp.id}
                onClick={() => selectPredefined(bp)}
                className="text-left border rounded-lg p-4 hover:bg-muted/50 hover:border-primary/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="font-medium text-sm">{bp.name}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {bp.sections.length === 0
                    ? "Start blank — add your own content"
                    : `${bp.sections.length} section${bp.sections.length !== 1 ? "s" : ""}`}
                </div>
              </button>
            ))}
          </div>
        </div>

        {loadingCustom && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          </div>
        )}

        {!loadingCustom && customBlueprints.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              Custom
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {customBlueprints.map((bp) => {
                let sectionCount = 0;
                try {
                  sectionCount = JSON.parse(bp.sections_json).length;
                } catch {
                  /* ignore */
                }
                return (
                  <button
                    key={bp.id}
                    onClick={() => selectCustom(bp)}
                    className="text-left border rounded-lg p-4 hover:bg-muted/50 hover:border-primary/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="font-medium text-sm">{bp.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {sectionCount} section{sectionCount !== 1 ? "s" : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // -- Section fill step ------------------------------------------------------
  const idx = step;
  const section = sections[idx];
  const isFirst = idx === 0;
  const isLast = idx === sections.length - 1;

  const hintTokens =
    section.sectionKey && SECTION_VARIABLE_HINTS[section.sectionKey]
      ? SECTION_VARIABLE_HINTS[section.sectionKey]
      : ALL_VARIABLE_TOKENS;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="text-muted-foreground"
        >
          <X className="w-4 h-4 mr-1" />
          Cancel
        </Button>
        <div>
          <div className="text-xs text-muted-foreground">
            Section {idx + 1} of {sections.length}
          </div>
          <h2 className="text-lg font-semibold">{section.title}</h2>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1.5">
        {sections.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full flex-1 ${
              i === idx
                ? "bg-primary"
                : i < idx
                  ? "bg-primary/40"
                  : "bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Content area + variable chips */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <label className="text-sm font-medium block">Content</label>
          <textarea
            ref={textareaRef}
            key={idx}
            value={section.content}
            onChange={(e) => updateContent(idx, e.target.value)}
            placeholder={`Write the content for "${section.title}"...`}
            className="w-full min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
            rows={10}
          />
          <p className="text-xs text-muted-foreground">
            Each line becomes a paragraph. Click a variable chip to insert it at
            the cursor.
          </p>
        </div>

        {/* Variable chips */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Variables</h3>
          <p className="text-xs text-muted-foreground">
            Click to insert at cursor position
          </p>
          <div className="flex flex-wrap gap-1.5 max-h-[300px] overflow-y-auto">
            {hintTokens.map((token) => (
              <button
                key={token}
                onClick={() => insertTokenAtCursor(idx, token)}
                className="inline-flex items-center px-2 py-1 rounded text-xs font-mono bg-muted hover:bg-muted/80 border border-border hover:border-primary/50 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                title={`Insert ${token}`}
              >
                {token}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2 border-t">
        <Button variant="outline" size="sm" onClick={handlePrev}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          {isFirst ? "Back to blueprints" : "Previous"}
        </Button>

        {isLast ? (
          <Button size="sm" onClick={handleFinish}>
            <Check className="w-4 h-4 mr-1" />
            Finish
          </Button>
        ) : (
          <Button size="sm" onClick={handleNext}>
            Next
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
