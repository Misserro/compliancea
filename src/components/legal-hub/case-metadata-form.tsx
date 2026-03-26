"use client";

import { useState, useEffect } from "react";
import { Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import type { LegalCase, OrgMember } from "@/lib/types";
import { useTranslations, useLocale } from "next-intl";
import { LEGAL_CASE_TYPES } from "@/lib/constants";
import { calculateCourtFee } from "@/lib/court-fee";

interface CaseMetadataFormProps {
  legalCase: LegalCase;
  caseId: number;
  onSaved: () => void;
}

// REPRESENTING_LABELS moved to LegalHub.representing.* translations

function parseExtensionData(extStr: string): Record<string, unknown> {
  try {
    const obj = JSON.parse(extStr);
    return typeof obj === "object" && obj !== null ? obj : {};
  } catch {
    return {};
  }
}

export function CaseMetadataForm({ legalCase, caseId, onSaved }: CaseMetadataFormProps) {
  const { data: sessionData } = useSession();
  const t = useTranslations('LegalHub');
  const tCommon = useTranslations('Common');
  const tType = useTranslations("CaseTypes");
  const locale = useLocale();
  const isAdmin = sessionData?.user?.orgRole !== "member";

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [reassigning, setReassigning] = useState(false);

  // Fetch org members for admin reassignment dropdown
  useEffect(() => {
    if (isAdmin) {
      fetch("/api/org/members")
        .then((res) => res.json())
        .then((data) => {
          if (data.members) setMembers(data.members);
        })
        .catch((err) => { console.warn("Failed to load org members for reassignment:", err); });
    }
  }, [isAdmin]);

  const handleReassign = async (newUserId: string) => {
    setReassigning(true);
    try {
      const res = await fetch(`/api/legal-hub/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to: Number(newUserId) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Nie udało się przepisać sprawy");
      }
      toast.success("Sprawa przepisana");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nie udało się przepisać sprawy");
    } finally {
      setReassigning(false);
    }
  };

  const parseTags = (tagsStr: string): string => {
    try {
      const arr = JSON.parse(tagsStr);
      return Array.isArray(arr) ? arr.join(", ") : "";
    } catch {
      return "";
    }
  };

  const extData = parseExtensionData(legalCase.extension_data);

  const [form, setForm] = useState({
    title: legalCase.title || "",
    case_type: legalCase.case_type || "",
    reference_number: legalCase.reference_number || "",
    internal_number: legalCase.internal_number || "",
    procedure_type: legalCase.procedure_type || "",
    court: legalCase.court || "",
    court_division: legalCase.court_division || "",
    representing_side: (extData.representing_side as string) || "",
    summary: legalCase.summary || "",
    claim_description: legalCase.claim_description || "",
    claim_value: legalCase.claim_value?.toString() || "",
    claim_currency: legalCase.claim_currency || "PLN",
    tags: parseTags(legalCase.tags),
  });

  const resetForm = () => {
    const currentExtData = parseExtensionData(legalCase.extension_data);
    setForm({
      title: legalCase.title || "",
      case_type: legalCase.case_type || "",
      reference_number: legalCase.reference_number || "",
      internal_number: legalCase.internal_number || "",
      procedure_type: legalCase.procedure_type || "",
      court: legalCase.court || "",
      court_division: legalCase.court_division || "",
      representing_side: (currentExtData.representing_side as string) || "",
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
      const currentExtData = parseExtensionData(legalCase.extension_data);
      const payload: Record<string, unknown> = {
        title: form.title.trim() || null,
        case_type: form.case_type,
        reference_number: form.reference_number.trim() || null,
        internal_number: form.internal_number.trim() || null,
        procedure_type: form.procedure_type.trim() || null,
        court: form.court.trim() || null,
        court_division: form.court_division.trim() || null,
        summary: form.summary.trim() || null,
        claim_description: form.claim_description.trim() || null,
        claim_value: form.claim_value ? parseFloat(form.claim_value) : null,
        claim_currency: form.claim_currency.trim() || "PLN",
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        extension_data: {
          ...currentExtData,
          representing_side: form.representing_side || null,
        },
      };

      const res = await fetch(`/api/legal-hub/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Nie udało się zapisać");
      }

      toast.success("Metadane sprawy zapisane");
      setEditing(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nie udało się zapisać");
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
          <span className="text-xs font-medium text-muted-foreground">Edytuj metadane sprawy</span>
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
            <label className={fieldLabel}>Tytuł sprawy *</label>
            <input
              type="text"
              className={inputClass}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Tytuł sprawy..."
            />
          </div>
          <div>
            <label className={fieldLabel}>Typ sprawy *</label>
            <select
              className={inputClass}
              value={form.case_type}
              onChange={(e) => setForm({ ...form, case_type: e.target.value })}
            >
              {LEGAL_CASE_TYPES.map((caseType) => (
                <option key={caseType} value={caseType}>
                  {tType(caseType)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={fieldLabel}>Numer referencyjny</label>
            <input
              type="text"
              className={inputClass}
              value={form.reference_number}
              onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
              placeholder="Sygnatura akt..."
            />
          </div>
          <div>
            <label className={fieldLabel}>Numer wewnętrzny</label>
            <input
              type="text"
              className={inputClass}
              value={form.internal_number}
              onChange={(e) => setForm({ ...form, internal_number: e.target.value })}
              placeholder="Numer wewnętrzny..."
            />
          </div>
          <div>
            <label className={fieldLabel}>Tryb postępowania</label>
            <input
              type="text"
              className={inputClass}
              value={form.procedure_type}
              onChange={(e) => setForm({ ...form, procedure_type: e.target.value })}
              placeholder="np. upominawcze..."
            />
          </div>
          <div>
            <label className={fieldLabel}>Sąd</label>
            <input
              type="text"
              className={inputClass}
              value={form.court}
              onChange={(e) => setForm({ ...form, court: e.target.value })}
              placeholder="Nazwa sądu..."
            />
          </div>
          <div>
            <label className={fieldLabel}>Wydział</label>
            <input
              type="text"
              className={inputClass}
              value={form.court_division}
              onChange={(e) => setForm({ ...form, court_division: e.target.value })}
              placeholder="Wydział..."
            />
          </div>
          <div>
            <label className={fieldLabel}>Reprezentujemy</label>
            <select
              className={inputClass}
              value={form.representing_side}
              onChange={(e) => setForm({ ...form, representing_side: e.target.value })}
            >
              <option value="">— Nieokreślone —</option>
              <option value="plaintiff">Powód</option>
              <option value="defendant">Pozwany</option>
            </select>
          </div>
          <div>
            <label className={fieldLabel}>Wartość przedmiotu sporu</label>
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
            <label className={fieldLabel}>Opis</label>
            <textarea
              className={`${inputClass} min-h-[60px]`}
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              placeholder="Podstawa faktyczna..."
              rows={3}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className={fieldLabel}>Przedmiot roszczenia</label>
            <textarea
              className={`${inputClass} min-h-[60px]`}
              value={form.claim_description}
              onChange={(e) => setForm({ ...form, claim_description: e.target.value })}
              placeholder="Czego dotyczy roszczenie..."
              rows={3}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className={fieldLabel}>Tagi (oddzielone przecinkami)</label>
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

  const representingSide = (parseExtensionData(legalCase.extension_data).representing_side as string) || null;

  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">Metadane sprawy</span>
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
          <div className="text-muted-foreground text-xs font-medium mb-1">Przypisany do</div>
          {isAdmin && members.length > 0 ? (
            <select
              className="w-full px-2 py-1.5 border rounded text-sm bg-background"
              value={legalCase.assigned_to != null ? String(legalCase.assigned_to) : ""}
              onChange={(e) => handleReassign(e.target.value)}
              disabled={reassigning}
            >
              {members.map((m) => (
                <option key={m.user_id} value={String(m.user_id)}>
                  {m.name || m.email}
                </option>
              ))}
            </select>
          ) : (
            <div>{legalCase.assigned_to_name || "\u2014"}</div>
          )}
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Tytuł sprawy</div>
          <div className="font-medium">{legalCase.title}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Typ sprawy</div>
          <div>{tType(legalCase.case_type)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Numer referencyjny</div>
          <div>{formatValue(legalCase.reference_number)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Numer wewnętrzny</div>
          <div>{formatValue(legalCase.internal_number)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Tryb postępowania</div>
          <div>{formatValue(legalCase.procedure_type)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Sąd</div>
          <div>{formatValue(legalCase.court)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Wydział</div>
          <div>{formatValue(legalCase.court_division)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Reprezentujemy</div>
          <div>{representingSide ? (t(`representing.${representingSide}` as Parameters<typeof t>[0]) ?? representingSide) : "\u2014"}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Wartość przedmiotu sporu</div>
          <div>
            {legalCase.claim_value != null
              ? `${legalCase.claim_value.toLocaleString()} ${legalCase.claim_currency}`
              : "\u2014"}
          </div>
        </div>
        {legalCase.case_type === "civil" && (() => {
          const courtFee = calculateCourtFee(legalCase.claim_value);
          return (
            <div>
              <div className="text-muted-foreground text-xs font-medium mb-1">Opłata sądowa</div>
              <div>
                {legalCase.claim_currency !== "PLN" ? (
                  <span className="text-muted-foreground text-xs">
                    Obliczanie opłaty sądowej dotyczy wyłącznie roszczeń w PLN
                  </span>
                ) : courtFee !== null ? (
                  `${courtFee.toLocaleString()} PLN`
                ) : (
                  "\u2014"
                )}
              </div>
            </div>
          );
        })()}
        {legalCase.summary && (
          <div className="md:col-span-2 lg:col-span-3">
            <div className="text-muted-foreground text-xs font-medium mb-1">Opis</div>
            <div className="whitespace-pre-wrap">{legalCase.summary}</div>
          </div>
        )}
        {legalCase.claim_description && (
          <div className="md:col-span-2 lg:col-span-3">
            <div className="text-muted-foreground text-xs font-medium mb-1">Przedmiot roszczenia</div>
            <div className="whitespace-pre-wrap">{legalCase.claim_description}</div>
          </div>
        )}
        {tags && (
          <div className="md:col-span-2 lg:col-span-3">
            <div className="text-muted-foreground text-xs font-medium mb-1">Tagi</div>
            <div>{tags}</div>
          </div>
        )}
      </div>
    </div>
  );
}
