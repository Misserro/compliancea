"use client";

import { useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import type { Contract } from "@/lib/types";

interface ContractMetadataDisplayProps {
  contract: Contract;
  onSave?: (data: Record<string, unknown>) => void;
}

export function ContractMetadataDisplay({ contract, onSave }: ContractMetadataDisplayProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    contracting_company: contract.contracting_company || "",
    contracting_vendor: contract.contracting_vendor || "",
    signature_date: contract.signature_date || "",
    commencement_date: contract.commencement_date || "",
    expiry_date: contract.expiry_date || "",
  });
  const [indefinite, setIndefinite] = useState(!contract.expiry_date);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "\u2014";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave({
        contracting_company: form.contracting_company || null,
        contracting_vendor: form.contracting_vendor || null,
        signature_date: form.signature_date || null,
        commencement_date: form.commencement_date || null,
        expiry_date: indefinite ? null : (form.expiry_date || null),
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm({
      contracting_company: contract.contracting_company || "",
      contracting_vendor: contract.contracting_vendor || "",
      signature_date: contract.signature_date || "",
      commencement_date: contract.commencement_date || "",
      expiry_date: contract.expiry_date || "",
    });
    setIndefinite(!contract.expiry_date);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Edit Contract Info</span>
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
            <label className="text-muted-foreground text-xs font-medium mb-1 block">Our Company</label>
            <input
              type="text"
              className="w-full px-2 py-1.5 border rounded text-sm bg-background"
              value={form.contracting_company}
              onChange={(e) => setForm({ ...form, contracting_company: e.target.value })}
              placeholder="Company name..."
            />
          </div>
          <div>
            <label className="text-muted-foreground text-xs font-medium mb-1 block">Vendor</label>
            <input
              type="text"
              className="w-full px-2 py-1.5 border rounded text-sm bg-background"
              value={form.contracting_vendor}
              onChange={(e) => setForm({ ...form, contracting_vendor: e.target.value })}
              placeholder="Vendor name..."
            />
          </div>
          <div>
            <label className="text-muted-foreground text-xs font-medium mb-1 block">Signature Date</label>
            <input
              type="date"
              className="w-full px-2 py-1.5 border rounded text-sm bg-background"
              value={form.signature_date}
              onChange={(e) => setForm({ ...form, signature_date: e.target.value })}
            />
          </div>
          <div>
            <label className="text-muted-foreground text-xs font-medium mb-1 block">Commencement Date</label>
            <input
              type="date"
              className="w-full px-2 py-1.5 border rounded text-sm bg-background"
              value={form.commencement_date}
              onChange={(e) => setForm({ ...form, commencement_date: e.target.value })}
            />
          </div>
          <div>
            <label className="text-muted-foreground text-xs font-medium mb-1 block">Expiry Date</label>
            <div className="flex items-center gap-2">
              {!indefinite && (
                <input
                  type="date"
                  className="flex-1 px-2 py-1.5 border rounded text-sm bg-background"
                  value={form.expiry_date}
                  onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                />
              )}
              <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={indefinite}
                  onChange={(e) => setIndefinite(e.target.checked)}
                />
                Indefinite
              </label>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">Contract Info</span>
        {onSave && (
          <button
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            onClick={() => setEditing(true)}
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Contract Name</div>
          <div className="font-medium">{contract.name}</div>
        </div>

        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Our Company</div>
          <div>{contract.contracting_company || "\u2014"}</div>
        </div>

        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Vendor</div>
          <div>{contract.contracting_vendor || contract.client || "\u2014"}</div>
        </div>

        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Signature Date</div>
          <div>{formatDate(contract.signature_date)}</div>
        </div>

        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Commencement Date</div>
          <div>{formatDate(contract.commencement_date)}</div>
        </div>

        <div>
          <div className="text-muted-foreground text-xs font-medium mb-1">Expiry Date</div>
          <div>{contract.expiry_date ? formatDate(contract.expiry_date) : "Indefinite"}</div>
        </div>
      </div>
    </div>
  );
}
