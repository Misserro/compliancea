"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, X, Check, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import type { CaseDeadline } from "@/lib/types";

interface CaseDeadlinesSectionProps {
  deadlines: CaseDeadline[];
  caseId: number;
  onRefresh: () => void;
}

const DEADLINE_TYPES = [
  "hearing", "response_deadline", "appeal_deadline",
  "filing_deadline", "payment", "other",
] as const;

const DEADLINE_TYPE_LABELS: Record<string, string> = {
  hearing: "Rozprawa",
  response_deadline: "Termin odpowiedzi",
  appeal_deadline: "Termin odwołania",
  filing_deadline: "Termin złożenia",
  payment: "Płatność",
  other: "Inny",
};

const DEADLINE_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  met: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  missed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  cancelled: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

interface DeadlineFormData {
  title: string;
  deadline_type: string;
  due_date: string;
  description: string;
}

const emptyForm: DeadlineFormData = {
  title: "",
  deadline_type: "hearing",
  due_date: "",
  description: "",
};

function isOverdue(deadline: CaseDeadline): boolean {
  if (deadline.status !== "pending") return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(deadline.due_date);
  due.setHours(0, 0, 0, 0);
  return due < now;
}

function formatDate(dateString: string) {
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

export function CaseDeadlinesSection({ deadlines, caseId, onRefresh }: CaseDeadlinesSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState<CaseDeadline | null>(null);
  const [form, setForm] = useState<DeadlineFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);

  const openAdd = () => {
    setEditingDeadline(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (deadline: CaseDeadline) => {
    setEditingDeadline(deadline);
    setForm({
      title: deadline.title,
      deadline_type: deadline.deadline_type,
      due_date: deadline.due_date,
      description: deadline.description || "",
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingDeadline(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Tytuł jest wymagany");
      return;
    }
    if (!form.due_date) {
      toast.error("Data terminu jest wymagana");
      return;
    }

    setSaving(true);
    try {
      const url = editingDeadline
        ? `/api/legal-hub/cases/${caseId}/deadlines/${editingDeadline.id}`
        : `/api/legal-hub/cases/${caseId}/deadlines`;
      const method = editingDeadline ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Nie udało się zapisać terminu");
      }

      toast.success(editingDeadline ? "Termin zaktualizowany" : "Termin dodany");
      handleCancel();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nie udało się zapisać");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkMet = async (deadlineId: number) => {
    setActionId(deadlineId);
    try {
      const res = await fetch(`/api/legal-hub/cases/${caseId}/deadlines/${deadlineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "met" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Nie udało się zaktualizować terminu");
      }
      toast.success("Termin oznaczony jako zrealizowany");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nie udało się zaktualizować");
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (deadlineId: number) => {
    setActionId(deadlineId);
    try {
      const res = await fetch(`/api/legal-hub/cases/${caseId}/deadlines/${deadlineId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Nie udało się usunąć terminu");
      }
      toast.success("Termin usunięty");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nie udało się usunąć");
    } finally {
      setActionId(null);
    }
  };

  const fieldLabel = "text-muted-foreground text-xs font-medium mb-1 block";
  const inputClass = "w-full px-2 py-1.5 border rounded text-sm bg-background";

  return (
    <div className="bg-card border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Terminy</span>
        <button
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded hover:bg-muted text-muted-foreground"
          onClick={openAdd}
        >
          <Plus className="w-3.5 h-3.5" />
          Dodaj termin
        </button>
      </div>

      {/* Deadline list */}
      {deadlines.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground py-2">Brak terminów.</p>
      )}

      {deadlines.map((deadline) => {
        const overdue = isOverdue(deadline);
        const statusColor =
          overdue
            ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
            : DEADLINE_STATUS_COLORS[deadline.status] || DEADLINE_STATUS_COLORS.pending;
        const statusLabel = overdue ? "Przeterminowany" : deadline.status.charAt(0).toUpperCase() + deadline.status.slice(1);

        return (
          <div
            key={deadline.id}
            className={`flex items-start justify-between border rounded p-3 text-sm ${
              overdue ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" : ""
            }`}
          >
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{deadline.title}</span>
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                  {DEADLINE_TYPE_LABELS[deadline.deadline_type] || deadline.deadline_type}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>
                  {statusLabel}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className={overdue ? "text-red-600 dark:text-red-400 font-medium" : ""}>
                  Termin: {formatDate(deadline.due_date)}
                </span>
                {deadline.completed_at && (
                  <span>Ukończono: {formatDate(deadline.completed_at)}</span>
                )}
              </div>
              {deadline.description && (
                <p className="text-xs text-muted-foreground">{deadline.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              {deadline.status === "pending" && (
                <button
                  className="p-1 rounded hover:bg-muted text-green-600 dark:text-green-400"
                  onClick={() => handleMarkMet(deadline.id)}
                  disabled={actionId === deadline.id}
                  title="Oznacz jako spełniony"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                className="p-1 rounded hover:bg-muted text-muted-foreground"
                onClick={() => openEdit(deadline)}
                title="Edytuj"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                className="p-1 rounded hover:bg-muted text-destructive"
                onClick={() => handleDelete(deadline.id)}
                disabled={actionId === deadline.id}
                title="Usuń"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}

      {/* Add/Edit form */}
      {showForm && (
        <div className="border rounded p-3 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {editingDeadline ? "Edytuj termin" : "Dodaj termin"}
            </span>
            <div className="flex items-center gap-1">
              <button
                className="p-1 rounded hover:bg-muted text-green-600 dark:text-green-400"
                onClick={handleSave}
                disabled={saving}
                title="Zapisz"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                className="p-1 rounded hover:bg-muted text-muted-foreground"
                onClick={handleCancel}
                disabled={saving}
                title="Anuluj"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Tytuł *</label>
              <input
                type="text"
                className={inputClass}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Tytuł terminu..."
              />
            </div>
            <div>
              <label className={fieldLabel}>Typ *</label>
              <select
                className={inputClass}
                value={form.deadline_type}
                onChange={(e) => setForm({ ...form, deadline_type: e.target.value })}
              >
                {DEADLINE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DEADLINE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={fieldLabel}>Data terminu *</label>
              <input
                type="date"
                className={inputClass}
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className={fieldLabel}>Opis</label>
              <textarea
                className={`${inputClass} min-h-[40px]`}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Dodatkowe informacje..."
                rows={2}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
