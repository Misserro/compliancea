"use client";

import { useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import type { LegalCase } from "@/lib/types";
import { LEGAL_CASE_TYPES, LEGAL_CASE_TYPE_LABELS } from "@/lib/constants";

interface CaseMetadataFormProps {
  legalCase: LegalCase;
  caseId: number;
  onSaved: () => void;
}

export function CaseMetadataForm({ legalCase, caseId, onSaved }: CaseMetadataFormProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const parseTags = (tagsStr: string): string => {
    try {
      const arr = JSON.parse(tagsStr);
      return Array.isArray(arr) ? arr.join(", ") : "";
    } catch {
      return "";
    }
  };

  const [form, setForm] = useState({
    title: legalCase.title || "",
    case_type: legalCase.case_type || "",
    reference_number: legalCase.reference_number || "",
    internal_number: legalCase.internal_number || "",
    procedure_type: legalCase.procedure_type || "",
    court: legalCase.court || "",
    court_division: legalCase.court_division || "",
    judge: legalCase.judge || "",
    summary: legalCase.summary || "",
    claim_description: legalCase.claim_description || "",
    claim_value: legalCase.claim_value?.toString() || "",
    claim_currency: legalCase.claim_currency || "PLN",
    tags: parseTags(legalCase.tags),
  });

  const resetForm = () => {
    setForm({
      title: legalCase.title || "",
      case_type: legalCase.case_type || "",
      reference_number: legalCase.reference_number || "",
      internal_number: legalCase.internal_number || "",
      procedure_type: legalCase.procedure_type || "",
      court: legalCase.court || "",
      court_division: legalCase.court_division || "",
      judge: legalCase.judge || "",
      summary: legalCase.summary || "",
      claim_description: legalCase.claim_description || "",
      claim_value: legalCase.claim_value?.toString() || "",
      claim_currency: legalCase.claim_currency || "PLN",
      tags: parseTags(legalCase.tags),
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim() || null,
        case_type: form.case_type,
        reference_number: form.reference_number.trim() || null,
        internal_number: form.internal_number.trim() || null,
        procedure_type: form.procedure_type.trim() || null,
        court: form.court.trim() || null,
        court_division: form.court_division.trim() || null,
        judge: form.judge.trim() || null,
        summary: form.summary.trim() || null,
        claim_description: form.claim_description.trim() || null,
        claim_value: form.claim_value ? parseFloat(form.claim_value) : null,
        claim_currency: form.claim_currency.trim() || "PLN",
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      };

      const res = await fetch(`/api/legal-hub/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }

      toast.success("Case metadata saved");
      setEditing(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    resetForm();
    setEditing(false);
  };

  const fieldLabel = "text-muted-foreground text-xs font-medium mb-1 block";
  const inputClass = "w-full px-2 py-1.5 border rounded text-sm bg-background";

  if (editing) {
    return (
      <div className="bg-card border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Edit Case Metadata</span>
          <div className="flex items-center gap-1">
            <button
              className="p-1 rounded hover:bg-muted text-green-600 dark:text-green-400"
              onClick={handleSave}
              disabled={saving}
              title="Save"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              className="p-1 rounded hover:bg-muted text-muted-foreground"
              onClick={handleCancel}
              disabled={saving}
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <div>
            <label className={fieldLabel}>Title *</label>
            <input
              type="text"
              className={inputClass}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Case title..."
            />
          </div>
          <div>
            <label className={fieldLabel}>Case Type *</label>
            <select
              className={inputClass}
              value={form.case_type}
              onChange={(e) => setForm({ ...form, case_type: e.target.value })}
            >
              {LEGAL_CASE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LEGAL_CASE_TYPE_LABELS[t] || t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={fieldLabel}>Reference Number</label>
            <input
              type="text"
              className={inputClass}
              value={form.reference_number}
              onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
              placeholder="Sygnatura akt..."
            />
          </div>
          <div>
            <label className={fieldLabel}>Internal Number</label>
            <input
              type="text"
              className={inputClass}
              value={form.internal_number}
              onChange={(e) => setForm({ ...form, internal_number: e.target.value })}
              placeholder="Internal reference..."
            />
          </div>
          <div>
            <label className={fieldLabel}>Procedure Type</label>
            <input
              type="text"
              className={inputClass}
              value={form.procedure_type}
              onChange={(e) => setForm({ ...form, procedure_type: e.target.value })}
              placeholder="e.g. upominawcze..."
            />
          </div>
          <div>
            <label className={fieldLabel}>Court</label>
            <input
              type="text"
              className={inputClass}
              value={form.court}
              onChange={(e) => setForm({ ...form, court: e.target.value })}
              placeholder="Court name..."
            />
          </div>
          <div>
            <label className={fieldLabel}>Court Division</label>
            <input
              type="text"
              className={inputClass}
              value={form.court_division}
              onChange={(e) => setForm({ ...form, court_division: e.target.value })}
              placeholder="Division..."
            />
          </div>
          <div>
            <label className={fieldLabel}>Judge</label>
            <input
              type="text"
              className={inputClass}
              value={form.judge}
              onChange={(e) => setForm({ ...form, judge: e.target.value })}
              placeholder="Judge name..."
            />
          </div>
          <div>
            <label className={fieldLabel}>Claim Value</label>
            <div className="flex gap-2">
              <input
                type="number"
                className={`${inputClass} flex-1`}
                value={form.claim_value}
                onChange={(e) => setForm({ ...form, claim_value: e.target.value })}
                placeholder="0.00"
                step="0.01"
              />
              <input
                type="text"
                className="w-16 px-2 py-1.5 border rounded text-sm bg-background text-center"
                value={form.claim_currency}
                onChange={(e) => setForm({ ...form, claim_currency: e.target.value })}
              />
            </div>
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className={fieldLabel}>Summary</label>
            <textarea
              className={`${inputClass} min-h-[60px]`}
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              placeholder="Factual basis..."
              rows={3}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className={fieldLabel}>Claim Description</label>
            <textarea
              className={`${inputClass} min-h-[60px]`}
              value={form.claim_description}
              onChange={(e) => setForm({ ...form, claim_description: e.target.value })}
              placeholder="What is being claimed..."
              rows={3}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className={fieldLabel}>Tags (comma-separated)</label>
            <input
              type="text"
              className={inputClass}
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="tag1, tag2, tag3..."
            />
          </div>
        </div>
      </div>
    );
  }

  // View mode
  const formatValue = (val: string | number | null | undefined) =>
    val != null && val !== "" ? String(val) : "\u2014";

  const tags = (() => {
    try {
      const arr = JSON.parse(legalCase.tags);
      return Array.isArray(arr) && arr.length > 0 ? arr.join(", ") : null;
    } catch {
      return null;
    }
  })();

  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">Case Metadata</span>
        <button
          className="p-1 rounded hover:bg-muted text-muted-foreground"
          onClick={() => setEditing(true)}
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Title</div>
          <div className="font-medium">{legalCase.title}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Case Type</div>
          <div>{LEGAL_CASE_TYPE_LABELS[legalCase.case_type] || legalCase.case_type}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Reference Number</div>
          <div>{formatValue(legalCase.reference_number)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Internal Number</div>
          <div>{formatValue(legalCase.internal_number)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Procedure Type</div>
          <div>{formatValue(legalCase.procedure_type)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Court</div>
          <div>{formatValue(legalCase.court)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Court Division</div>
          <div>{formatValue(legalCase.court_division)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Judge</div>
          <div>{formatValue(legalCase.judge)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Claim Value</div>
          <div>
            {legalCase.claim_value != null
              ? `${legalCase.claim_value.toLocaleString()} ${legalCase.claim_currency}`
              : "\u2014"}
          </div>
        </div>
        {legalCase.summary && (
          <div className="md:col-span-2 lg:col-span-3">
            <div className="text-muted-foreground text-xs font-medium mb-1">Summary</div>
            <div className="whitespace-pre-wrap">{legalCase.summary}</div>
          </div>
        )}
        {legalCase.claim_description && (
          <div className="md:col-span-2 lg:col-span-3">
            <div className="text-muted-foreground text-xs font-medium mb-1">Claim Description</div>
            <div className="whitespace-pre-wrap">{legalCase.claim_description}</div>
          </div>
        )}
        {tags && (
          <div className="md:col-span-2 lg:col-span-3">
            <div className="text-muted-foreground text-xs font-medium mb-1">Tags</div>
            <div>{tags}</div>
          </div>
        )}
      </div>
    </div>
  );
}
