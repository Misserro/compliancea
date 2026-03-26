"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { CaseParty } from "@/lib/types";

interface CasePartiesSectionProps {
  parties: CaseParty[];
  caseId: number;
  onRefresh: () => void;
}

const PARTY_TYPES = ["plaintiff", "defendant", "third_party", "witness", "other"] as const;
const REPRESENTATIVE_TYPES = ["attorney", "legal_counsel", "other"] as const;

const PARTY_TYPE_COLORS: Record<string, string> = {
  plaintiff: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  defendant: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  third_party: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  witness: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  other: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

interface PartyFormData {
  party_type: string;
  name: string;
  address: string;
  representative_name: string;
  representative_address: string;
  representative_type: string;
  notes: string;
}

const emptyForm: PartyFormData = {
  party_type: "plaintiff",
  name: "",
  address: "",
  representative_name: "",
  representative_address: "",
  representative_type: "",
  notes: "",
};

export function CasePartiesSection({ parties, caseId, onRefresh }: CasePartiesSectionProps) {
  const t = useTranslations('LegalHub');
  const [showForm, setShowForm] = useState(false);
  const [editingParty, setEditingParty] = useState<CaseParty | null>(null);
  const [form, setForm] = useState<PartyFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const openAdd = () => {
    setEditingParty(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (party: CaseParty) => {
    setEditingParty(party);
    setForm({
      party_type: party.party_type,
      name: party.name,
      address: party.address || "",
      representative_name: party.representative_name || "",
      representative_address: party.representative_address || "",
      representative_type: party.representative_type || "",
      notes: party.notes || "",
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingParty(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(t('parties.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      const url = editingParty
        ? `/api/legal-hub/cases/${caseId}/parties/${editingParty.id}`
        : `/api/legal-hub/cases/${caseId}/parties`;
      const method = editingParty ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('parties.saveError'));
      }

      toast.success(editingParty ? t('parties.partyUpdated') : t('parties.partyAdded'));
      handleCancel();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('parties.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (partyId: number) => {
    setDeleting(partyId);
    try {
      const res = await fetch(`/api/legal-hub/cases/${caseId}/parties/${partyId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('parties.deleteError'));
      }
      toast.success(t('parties.partyDeleted'));
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('parties.deleteError'));
    } finally {
      setDeleting(null);
    }
  };

  const fieldLabel = "text-muted-foreground text-xs font-medium mb-1 block";
  const inputClass = "w-full px-2 py-1.5 border rounded text-sm bg-background";

  return (
    <div className="bg-card border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{t('parties.title')}</span>
        <button
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded hover:bg-muted text-muted-foreground"
          onClick={openAdd}
        >
          <Plus className="w-3.5 h-3.5" />
          {t('parties.addParty')}
        </button>
      </div>

      {/* Party list */}
      {parties.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground py-2">{t('parties.noParties')}</p>
      )}

      {parties.map((party) => (
        <div
          key={party.id}
          className="flex items-start justify-between border rounded p-3 text-sm"
        >
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  PARTY_TYPE_COLORS[party.party_type] || PARTY_TYPE_COLORS.other
                }`}
              >
                {t(`partyType.${party.party_type}` as Parameters<typeof t>[0])}
              </span>
              <span className="font-medium">{party.name}</span>
            </div>
            {party.address && (
              <p className="text-xs text-muted-foreground">{party.address}</p>
            )}
            {party.representative_name && (
              <p className="text-xs text-muted-foreground">
                Rep: {party.representative_name}
                {party.representative_type && ` (${t(`representativeType.${party.representative_type}` as Parameters<typeof t>[0])})`}
              </p>
            )}
            {party.notes && (
              <p className="text-xs text-muted-foreground italic">{party.notes}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              className="p-1 rounded hover:bg-muted text-muted-foreground"
              onClick={() => openEdit(party)}
              title={t('parties.editParty')}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              className="p-1 rounded hover:bg-muted text-destructive"
              onClick={() => handleDelete(party.id)}
              disabled={deleting === party.id}
              title={t('Common.delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}

      {/* Add/Edit form */}
      {showForm && (
        <div className="border rounded p-3 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {editingParty ? t('parties.editParty') : t('parties.addParty')}
            </span>
            <div className="flex items-center gap-1">
              <button
                className="p-1 rounded hover:bg-muted text-green-600 dark:text-green-400"
                onClick={handleSave}
                disabled={saving}
                title={t('Common.save')}
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                className="p-1 rounded hover:bg-muted text-muted-foreground"
                onClick={handleCancel}
                disabled={saving}
                title={t('Common.cancel')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>{t('parties.partyTypeLabel')}</label>
              <select
                className={inputClass}
                value={form.party_type}
                onChange={(e) => setForm({ ...form, party_type: e.target.value })}
              >
                {PARTY_TYPES.map((pt) => (
                  <option key={pt} value={pt}>
                    {t(`partyType.${pt}` as Parameters<typeof t>[0])}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={fieldLabel}>{t('parties.nameLabel')}</label>
              <input
                type="text"
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('parties.namePlaceholder')}
              />
            </div>
            <div className="md:col-span-2">
              <label className={fieldLabel}>{t('parties.addressLabel')}</label>
              <textarea
                className={`${inputClass} min-h-[40px]`}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder={t('parties.addressPlaceholder')}
                rows={2}
              />
            </div>
            <div>
              <label className={fieldLabel}>{t('parties.representativeName')}</label>
              <input
                type="text"
                className={inputClass}
                value={form.representative_name}
                onChange={(e) => setForm({ ...form, representative_name: e.target.value })}
                placeholder={t('parties.representativeNamePlaceholder')}
              />
            </div>
            <div>
              <label className={fieldLabel}>{t('parties.representativeType')}</label>
              <select
                className={inputClass}
                value={form.representative_type}
                onChange={(e) => setForm({ ...form, representative_type: e.target.value })}
              >
                <option value="">{t('parties.representativeNone')}</option>
                {REPRESENTATIVE_TYPES.map((rt) => (
                  <option key={rt} value={rt}>
                    {t(`representativeType.${rt}` as Parameters<typeof t>[0])}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={fieldLabel}>{t('parties.representativeAddress')}</label>
              <textarea
                className={`${inputClass} min-h-[40px]`}
                value={form.representative_address}
                onChange={(e) => setForm({ ...form, representative_address: e.target.value })}
                placeholder={t('parties.representativeAddressPlaceholder')}
                rows={2}
              />
            </div>
            <div className="md:col-span-2">
              <label className={fieldLabel}>{t('parties.notes')}</label>
              <textarea
                className={`${inputClass} min-h-[40px]`}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder={t('parties.notesPlaceholder')}
                rows={2}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
