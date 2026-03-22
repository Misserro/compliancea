"use client";

import { useState, useRef } from "react";
import { Copy, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/ui/rich-text-editor";
import type { CaseTemplate } from "@/lib/types";

interface TemplateFormProps {
  template?: CaseTemplate | null;
  onSaved: () => void;
  onCancel: () => void;
  initialContent?: string;
}

const VARIABLE_REFERENCE = [
  { token: "{{today}}", description: "Current date (pl-PL format)" },
  { token: "{{case.reference_number}}", description: "Case reference number" },
  { token: "{{case.title}}", description: "Case title" },
  { token: "{{case.court}}", description: "Court name" },
  { token: "{{case.court_division}}", description: "Court division" },
  { token: "{{case.judge}}", description: "Judge name" },
  { token: "{{case.status}}", description: "Case status" },
  { token: "{{case.summary}}", description: "Case summary" },
  { token: "{{case.claim_value}}", description: "Claim value" },
  { token: "{{case.claim_currency}}", description: "Claim currency" },
  {
    token: "{{case.claim_description}}",
    description: "Claim description",
  },
  {
    token: "{{parties.plaintiff.name}}",
    description: "Plaintiff name",
  },
  {
    token: "{{parties.plaintiff.address}}",
    description: "Plaintiff address",
  },
  {
    token: "{{parties.defendant.name}}",
    description: "Defendant name",
  },
  {
    token: "{{parties.defendant.address}}",
    description: "Defendant address",
  },
  {
    token: "{{parties.representative.representative_name}}",
    description: "Representative name",
  },
  {
    token: "{{deadlines.next.title}}",
    description: "Next deadline title",
  },
  {
    token: "{{deadlines.next.due_date}}",
    description: "Next deadline date",
  },
  { token: "{{parties.plaintiff.notes}}", description: "Dodatkowe dane powoda (np. NIP/REGON)" },
  { token: "{{parties.defendant.notes}}", description: "Dodatkowe dane pozwanego (np. NIP/REGON)" },
  { token: "{{parties.representative.representative_address}}", description: "Adres pełnomocnika / kancelarii" },
  { token: "{{case.procedure_type}}", description: "Tryb postępowania" },
  { token: "{{case.case_type}}", description: "Typ sprawy" },
  { token: "{{case.internal_number}}", description: "Wewnętrzny numer akt" },
];

export function TemplateForm({
  template,
  onSaved,
  onCancel,
  initialContent,
}: TemplateFormProps) {
  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(
    template?.description || ""
  );
  const [documentType, setDocumentType] = useState(
    template?.document_type || ""
  );
  const [templateBody, setTemplateBody] = useState(
    template?.template_body || initialContent || ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<RichTextEditorHandle>(null);

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
    } catch {
      // Clipboard unavailable — insert directly into editor
      editorRef.current?.insertText(token);
    }
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required");
      return;
    }
    if (!templateBody.trim() || templateBody === "<p></p>") {
      setError("Template body is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const url = template
        ? `/api/legal-hub/templates/${template.id}`
        : "/api/legal-hub/templates";
      const method = template ? "PATCH" : "POST";

      const body: Record<string, unknown> = {
        name: trimmedName,
        description: description.trim() || null,
        document_type: documentType.trim() || null,
        template_body: templateBody,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save template");
      }

      onSaved();
    } catch (err) {
      console.error("Error saving template:", err);
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Form fields + editor */}
      <div className="lg:col-span-2 space-y-4">
        <h2 className="text-lg font-semibold">
          {template ? "Edit Template" : "New Template"}
        </h2>

        {error && (
          <div className="text-destructive text-sm bg-destructive/10 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Wezwanie do zaplaty"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">
              Description
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this template"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">
              Document Type
            </label>
            <Input
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              placeholder="e.g. pozew, wezwanie, pismo"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">
              Template Body <span className="text-destructive">*</span>
            </label>
            <RichTextEditor
              ref={editorRef}
              content={template?.template_body || initialContent || "<p>Start writing your template here...</p>"}
              onChange={setTemplateBody}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use {"{{variable}}"} placeholders from the reference panel. They
              will be replaced with case data during generation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button onClick={handleSubmit} disabled={saving} size="sm">
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {template ? "Save Changes" : "Create Template"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </div>

      {/* Variable reference panel */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Variable Reference</h3>
        <p className="text-xs text-muted-foreground">
          Click to copy a variable, then paste it into the template editor.
        </p>
        <div className="border rounded-lg divide-y max-h-[600px] overflow-y-auto">
          {VARIABLE_REFERENCE.map(({ token, description: desc }) => (
            <div
              key={token}
              className="flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors"
            >
              <div>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                  {token}
                </code>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {desc}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(token)}
                title="Copy to clipboard"
                className="shrink-0 ml-2"
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
