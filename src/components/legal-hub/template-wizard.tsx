"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Check, X, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PREDEFINED_BLUEPRINTS,
  SECTION_VARIABLE_HINTS,
  ALL_VARIABLE_TOKENS,
  combineWizardSections,
  type PredefinedBlueprint,
  type WizardSection,
  type WizardStep,
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

export function TemplateWizard({ onComplete, onCancel }: TemplateWizardProps) {
  const t = useTranslations('LegalHub');
  const [step, setStep] = useState<WizardStep>("blueprint");
  const [customBlueprints, setCustomBlueprints] = useState<CustomBlueprint[]>(
    []
  );
  const [loadingCustom, setLoadingCustom] = useState(true);
  const [sections, setSections] = useState<WizardSection[]>([]);
  const [selectedBlueprintName, setSelectedBlueprintName] = useState("");
  const [selectedDocumentType, setSelectedDocumentType] = useState<
    string | null
  >(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [polishedHtml, setPolishedHtml] = useState<string | null>(null);
  const [polishState, setPolishState] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [polishError, setPolishError] = useState<string | null>(null);
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
      }>,
      blueprintName: string,
      documentType: string | null
    ) => {
      if (blueprintSections.length === 0) {
        // Blank blueprint — go straight to form with empty content
        onComplete("");
        return;
      }
      setSelectedBlueprintName(blueprintName);
      setSelectedDocumentType(documentType);
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
      selectBlueprint(blueprint.sections, blueprint.name, blueprint.documentType);
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
      selectBlueprint(parsed, blueprint.name, null);
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

  const updateAiMode = (index: number, mode: "template" | "real") => {
    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, aiMode: mode } : s))
    );
  };

  const updateAiHint = (index: number, hint: string) => {
    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, aiHint: hint } : s))
    );
  };

  const handleAiGenerate = async (index: number) => {
    const sec = sections[index];
    const mode = sec.aiMode ?? "template";
    setAiLoading(true);
    setAiError(null);
    try {
      const previousSections = sections
        .slice(0, index)
        .map((s) => ({ title: s.title, content: s.content }));
      // Strip {{...}} wrappers — API re-wraps them
      const availableVariables = sec.variableHintKeys.map((v) =>
        v.replace(/^\{\{/, "").replace(/\}\}$/, "")
      );
      const res = await fetch("/api/legal-hub/wizard/ai-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blueprintName: selectedBlueprintName,
          documentType: selectedDocumentType,
          sectionTitle: sec.title,
          sectionKey: sec.sectionKey,
          mode,
          previousSections,
          userHint: sec.aiHint?.trim() || null,
          availableVariables,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const data = await res.json();
      updateContent(index, data.content);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setAiLoading(false);
    }
  };

  const handleNext = () => {
    if (typeof step === "number" && step < sections.length - 1) {
      setStep(step + 1);
    }
  };

  const handlePrev = () => {
    if (step === "ai-polish") {
      setStep(sections.length - 1);
      return;
    }
    if (typeof step === "number") {
      if (step > 0) {
        setStep(step - 1);
      } else {
        setStep("blueprint");
      }
    }
  };

  const handleFinish = () => {
    setPolishedHtml(null);
    setPolishState("idle");
    setPolishError(null);
    setStep("ai-polish");
  };

  const handlePolish = async () => {
    setPolishState("loading");
    setPolishError(null);
    try {
      const res = await fetch("/api/legal-hub/wizard/ai-polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: sections.map((s) => ({
            title: s.title,
            content: s.content,
          })),
          blueprintName: selectedBlueprintName,
          documentType: selectedDocumentType ?? null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error || "Błąd podczas ulepszania dokumentu"
        );
      }
      const data = await res.json();
      setPolishedHtml(data.polishedHtml);
      setPolishState("done");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Nieznany błąd";
      setPolishError(msg);
      setPolishState("error");
    }
  };

  const handleSkipPolish = () => {
    const html = combineWizardSections(
      sections.map((s) => ({ title: s.title, content: s.content }))
    );
    onComplete(html);
  };

  const handleAcceptPolished = () => {
    if (polishedHtml) onComplete(polishedHtml);
  };

  const handleRevertToOriginal = () => {
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
            {t('wizard.backToList')}
          </Button>
          <div>
            <h2 className="text-lg font-semibold">{t('wizard.selectBlueprint')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('wizard.selectBlueprintSubtitle')}
            </p>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            {t('wizard.predefined')}
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
                    ? t('wizard.blankDescription')
                    : t('wizard.sectionsCount', { count: bp.sections.length })}
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
              {t('wizard.custom')}
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
                      {t('wizard.sectionsCount', { count: sectionCount })}
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

  // -- AI polish step -----------------------------------------------------------
  if (step === "ai-polish") {
    const rawHtml = combineWizardSections(
      sections.map((s) => ({ title: s.title, content: s.content }))
    );

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
            {t('Common.cancel')}
          </Button>
          <div>
            <div className="text-xs text-muted-foreground">
              {t('wizard.lastStep')}
            </div>
            <h2 className="text-lg font-semibold flex items-center gap-1.5">
              <Sparkles className="w-5 h-5" />
              {t('wizard.aiPolish')}
            </h2>
          </div>
        </div>

        {/* Progress bar — all sections filled + polish step active */}
        <div className="flex gap-1.5">
          {sections.map((_, i) => (
            <div
              key={i}
              className="h-1.5 rounded-full flex-1 bg-primary/40"
            />
          ))}
          <div className="h-1.5 rounded-full flex-1 bg-primary" />
        </div>

        {/* Preview area */}
        <div className="space-y-3">
          <label className="text-sm font-medium block">
            {polishState === "done"
              ? t('wizard.polishedVersion')
              : t('wizard.previewDocument')}
          </label>
          <div
            className="rounded-md border border-input bg-background px-4 py-3 text-sm max-h-[400px] overflow-y-auto prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{
              __html: polishState === "done" && polishedHtml ? polishedHtml : rawHtml,
            }}
          />
        </div>

        {/* Action area */}
        <div className="space-y-3">
          {polishState === "idle" && (
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={handlePolish}>
                <Sparkles className="w-4 h-4 mr-1.5" />
                {t('wizard.polishWithAI')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSkipPolish}
              >
                {t('wizard.skip')}
              </Button>
            </div>
          )}

          {polishState === "loading" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('wizard.enhancing')}
            </div>
          )}

          {polishState === "done" && (
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={handleAcceptPolished}>
                <Check className="w-4 h-4 mr-1" />
                {t('wizard.usePolished')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRevertToOriginal}
              >
                {t('wizard.useOriginal')}
              </Button>
            </div>
          )}

          {polishState === "error" && (
            <div className="space-y-2">
              <p className="text-xs text-destructive">
                {polishError}
              </p>
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={handlePolish}>
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  {t('wizard.tryAgain')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSkipPolish}
                >
                  {t('wizard.skip')}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrev}
            disabled={polishState === "loading"}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            {t('Common.back')}
          </Button>
          <div />
        </div>
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
          {t('Common.cancel')}
        </Button>
        <div>
          <div className="text-xs text-muted-foreground">
            {t('wizard.sectionOf', { current: idx + 1, total: sections.length })}
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
          <label className="text-sm font-medium block">{t('wizard.content')}</label>
          <textarea
            ref={textareaRef}
            key={idx}
            value={section.content}
            onChange={(e) => updateContent(idx, e.target.value)}
            placeholder={t('wizard.contentPlaceholder', { title: section.title })}
            className="w-full min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
            rows={10}
          />
          <p className="text-xs text-muted-foreground">
            {t('wizard.contentHint')}
          </p>

          {/* AI Assist */}
          <div className="space-y-3 pt-3 border-t">
            <h3 className="text-sm font-medium flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              {t('wizard.aiAssistant')}
            </h3>

            {/* Mode toggle */}
            <div className="flex gap-0">
              <button
                type="button"
                onClick={() => updateAiMode(idx, "template")}
                className={`px-3 py-1.5 text-xs font-medium border transition-colors rounded-l-md ${
                  (section.aiMode ?? "template") === "template"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-input hover:bg-muted/50"
                }`}
              >
                {t('wizard.aiModeTemplate')}
              </button>
              <button
                type="button"
                onClick={() => updateAiMode(idx, "real")}
                className={`px-3 py-1.5 text-xs font-medium border border-l-0 transition-colors rounded-r-md ${
                  section.aiMode === "real"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-input hover:bg-muted/50"
                }`}
              >
                {t('wizard.aiModeReal')}
              </button>
            </div>

            {/* Hint textarea */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                {t('wizard.aiHintLabel')}
              </label>
              <textarea
                value={section.aiHint ?? ""}
                onChange={(e) => updateAiHint(idx, e.target.value)}
                placeholder={t('wizard.aiHintPlaceholder')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                rows={2}
              />
            </div>

            {/* Generate button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAiGenerate(idx)}
              disabled={aiLoading}
            >
              {aiLoading ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-1.5" />
              )}
              {aiLoading ? t('wizard.aiGenerating') : t('wizard.aiGenerate')}
            </Button>

            {/* Error display */}
            {aiError && (
              <p className="text-xs text-destructive">{aiError}</p>
            )}
          </div>
        </div>

        {/* Variable chips */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">{t('wizard.variablesTitle')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('wizard.variablesHint')}
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
          {isFirst ? t('wizard.backToBlueprints') : t('Common.back')}
        </Button>

        {isLast ? (
          <Button size="sm" onClick={handleFinish}>
            <Check className="w-4 h-4 mr-1" />
            {t('wizard.finish')}
          </Button>
        ) : (
          <Button size="sm" onClick={handleNext}>
            {t('wizard.next')}
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
