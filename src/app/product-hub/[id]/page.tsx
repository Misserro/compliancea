"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WizardProgressBar } from "@/components/product-hub/wizard-progress-bar";
import { Step1IntakeForm, EMPTY_INTAKE } from "@/components/product-hub/step1-intake-form";
import { Step2DocumentContext } from "@/components/product-hub/step2-document-context";
import { Step3TemplateSelector } from "@/components/product-hub/step3-template-selector";
import { Step4OutputViewer } from "@/components/product-hub/step4-output-viewer";
import { StatusBadge } from "@/components/product-hub/status-badge";
import { ExportMenu } from "@/components/product-hub/export-menu";
import { VersionHistoryDrawer } from "@/components/product-hub/version-history-drawer";
import { ContractLinkDialog } from "@/components/product-hub/contract-link-dialog";
import type {
  ProductFeature, IntakeForm, GeneratedOutputs, FeatureStatus, TemplateId,
} from "@/lib/types";

type SaveStatus = 'saved' | 'saving' | 'unsaved';

export default function ProductHubFeaturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [feature, setFeature] = useState<ProductFeature | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [generating, setGenerating] = useState(false);
  const [streamingTemplate, setStreamingTemplate] = useState<TemplateId | null>(null);
  const [streamingRawText, setStreamingRawText] = useState<Record<string, string>>({});
  const [outputs, setOutputs] = useState<GeneratedOutputs>({});
  const [editingTitle, setEditingTitle] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<Partial<ProductFeature>>({});

  // Load feature on mount
  useEffect(() => {
    fetch(`/api/product-hub/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.feature) {
          setFeature(d.feature);
          try { setOutputs(JSON.parse(d.feature.generated_outputs_json || '{}')); } catch { /**/ }
          if (d.feature.generated_outputs_json) setCurrentStep(4);
        }
      })
      .catch(() => toast.error('Failed to load feature'));
  }, [id]);

  // Debounced auto-save
  const scheduleSave = useCallback((patch: Partial<ProductFeature>) => {
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    setSaveStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await fetch(`/api/product-hub/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pendingPatchRef.current),
        });
        pendingPatchRef.current = {};
        setSaveStatus('saved');
      } catch {
        setSaveStatus('unsaved');
      }
    }, 2000);
  }, [id]);

  function updateFeature(patch: Partial<ProductFeature>) {
    setFeature(prev => prev ? { ...prev, ...patch } : null);
    scheduleSave(patch);
  }

  // Intake form helpers
  const intakeForm: IntakeForm = (() => {
    try {
      const parsed = JSON.parse(feature?.intake_form_json || 'null');
      return parsed?.sectionA ? parsed : EMPTY_INTAKE;
    } catch { return EMPTY_INTAKE; }
  })();

  function handleIntakeChange(intake: IntakeForm) {
    updateFeature({ intake_form_json: JSON.stringify(intake) });
  }

  // Step 2 helpers
  const selectedDocIds: number[] = (() => {
    try { return JSON.parse(feature?.selected_document_ids || '[]'); } catch { return []; }
  })();

  function handleContextChange(docIds: number[], freeContext: string) {
    updateFeature({ selected_document_ids: JSON.stringify(docIds), free_context: freeContext });
  }

  // Step 3 helpers
  const selectedTemplates: TemplateId[] = (() => {
    try { return JSON.parse(feature?.selected_templates || '[]'); } catch { return []; }
  })();

  function handleTemplatesChange(templates: TemplateId[]) {
    updateFeature({ selected_templates: JSON.stringify(templates) });
  }

  // Generation
  async function handleGenerate() {
    if (!feature || selectedTemplates.length === 0) return;
    setGenerating(true);
    setStreamingRawText({});

    try {
      const res = await fetch(`/api/product-hub/${id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templates: selectedTemplates,
          intake_form_json: feature.intake_form_json,
          selected_document_ids: feature.selected_document_ids,
          free_context: feature.free_context,
        }),
      });

      if (!res.ok) throw new Error('Generation failed');
      setCurrentStep(4);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'template_start') {
              setStreamingTemplate(event.template);
            } else if (event.type === 'raw_token') {
              setStreamingRawText(prev => ({
                ...prev,
                [event.template]: (prev[event.template] ?? '') + event.content,
              }));
            } else if (event.type === 'template_complete') {
              setOutputs(prev => ({
                ...prev,
                [event.template]: { sections: event.sections, gaps: event.gaps ?? [] },
              }));
              setStreamingTemplate(null);
            } else if (event.type === 'done') {
              const refreshed = await fetch(`/api/product-hub/${id}`).then(r => r.json());
              if (refreshed.feature) setFeature(refreshed.feature);
            } else if (event.type === 'error') {
              toast.error(`Generation error: ${event.message}`);
            }
          } catch { /* skip malformed lines */ }
        }
      }
    } catch (e) {
      toast.error(`Generation failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
      setStreamingTemplate(null);
    }
  }

  // Section regeneration
  async function handleRegenerate(template: TemplateId, section?: string) {
    if (!section) { handleGenerate(); return; }
    setStreamingTemplate(template);

    try {
      const res = await fetch(`/api/product-hub/${id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, section }),
      });
      if (!res.ok) throw new Error('Regeneration failed');

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'done') {
              setOutputs(prev => ({
                ...prev,
                [template]: {
                  sections: { ...(prev[template]?.sections ?? {}), [event.section]: event.content },
                  gaps: prev[template]?.gaps ?? [],
                },
              }));
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      toast.error(`Regeneration failed: ${String(e)}`);
    } finally {
      setStreamingTemplate(null);
    }
  }

  function handleOutputChange(template: TemplateId, sectionId: string, content: string) {
    setOutputs(prev => ({
      ...prev,
      [template]: {
        sections: { ...(prev[template]?.sections ?? {}), [sectionId]: content },
        gaps: prev[template]?.gaps ?? [],
      },
    }));
    updateFeature({ generated_outputs_json: JSON.stringify({
      ...outputs,
      [template]: {
        sections: { ...(outputs[template]?.sections ?? {}), [sectionId]: content },
        gaps: outputs[template]?.gaps ?? [],
      },
    })});
  }

  function handleVersionRestore(snapshot: GeneratedOutputs) {
    setOutputs(snapshot);
    updateFeature({ generated_outputs_json: JSON.stringify(snapshot) });
    toast.success('Version restored');
  }

  if (!feature) {
    return <div className="p-6 text-center text-muted-foreground text-sm">Loading…</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Top bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => router.push('/product-hub')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>

        {editingTitle ? (
          <Input
            autoFocus
            value={feature.title}
            onChange={(e) => updateFeature({ title: e.target.value })}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => e.key === 'Enter' && setEditingTitle(false)}
            className="h-8 text-base font-semibold w-60"
          />
        ) : (
          <button onClick={() => setEditingTitle(true)} className="text-base font-semibold hover:underline decoration-dashed underline-offset-4">
            {feature.title}
          </button>
        )}

        <StatusBadge
          status={feature.status}
          editable
          onChange={(status: FeatureStatus) => updateFeature({ status })}
        />

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : '●'}
          </span>
          {currentStep === 4 && (
            <>
              <VersionHistoryDrawer
                versionHistoryJson={feature.version_history_json}
                onRestore={handleVersionRestore}
              />
              <ExportMenu
                featureTitle={feature.title}
                activeTemplate={selectedTemplates[0] ?? 'prd'}
                outputs={outputs}
                featureId={feature.id}
              />
              <ContractLinkDialog
                featureId={feature.id}
                linkedContractId={feature.linked_contract_id}
                onLinked={(contractId) => updateFeature({ linked_contract_id: contractId })}
              />
            </>
          )}
        </div>
      </div>

      {/* Progress */}
      <WizardProgressBar
        currentStep={currentStep}
        intakeFormJson={feature.intake_form_json}
        onStepClick={(step) => {
          if (step < currentStep || (step === 4 && Object.keys(outputs).length > 0)) {
            setCurrentStep(step);
          }
        }}
      />

      {/* Steps */}
      {currentStep === 1 && (
        <Step1IntakeForm
          value={intakeForm}
          onChange={handleIntakeChange}
          onContinue={() => setCurrentStep(2)}
        />
      )}

      {currentStep === 2 && (
        <Step2DocumentContext
          selectedDocIds={selectedDocIds}
          freeContext={feature.free_context ?? ''}
          onChange={handleContextChange}
          onBack={() => setCurrentStep(1)}
          onContinue={() => setCurrentStep(3)}
        />
      )}

      {currentStep === 3 && (
        <Step3TemplateSelector
          selectedTemplates={selectedTemplates}
          generating={generating}
          onChange={handleTemplatesChange}
          onBack={() => setCurrentStep(2)}
          onGenerate={handleGenerate}
        />
      )}

      {currentStep === 4 && (
        <Step4OutputViewer
          selectedTemplates={selectedTemplates.length > 0 ? selectedTemplates : Object.keys(outputs) as TemplateId[]}
          outputs={outputs}
          streamingTemplate={streamingTemplate}
          streamingRawText={streamingRawText as Record<TemplateId, string>}
          onRegenerate={handleRegenerate}
          onOutputChange={handleOutputChange}
          onRegenerateAll={handleGenerate}
        />
      )}
    </div>
  );
}
