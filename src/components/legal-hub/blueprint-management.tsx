"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  Save,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CustomBlueprint {
  id: number;
  name: string;
  sections_json: string;
  created_at: string;
}

interface SectionRow {
  title: string;
  sectionKey: string | null;
}

const SECTION_KEY_OPTIONS: Array<{ value: string | null; label: string }> = [
  { value: null, label: "Niestandardowa" },
  { value: "court_header", label: "Oznaczenie sądu" },
  { value: "parties", label: "Strony" },
  { value: "claim", label: "Roszczenie" },
  { value: "factual_basis", label: "Uzasadnienie" },
  { value: "closing", label: "Zamknięcie" },
  { value: "deadlines", label: "Terminy" },
];

function parseSections(json: string): SectionRow[] {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.map((s: { title?: string; sectionKey?: string | null }) => ({
      title: s.title || "",
      sectionKey: s.sectionKey ?? null,
    }));
  } catch {
    return [];
  }
}

interface BlueprintManagementProps {
  onBack: () => void;
}

export function BlueprintManagement({ onBack }: BlueprintManagementProps) {
  const [blueprints, setBlueprints] = useState<CustomBlueprint[]>([]);
  const [loading, setLoading] = useState(true);
  // 'new' = create form, CustomBlueprint = edit form, undefined = list view
  const [editingBlueprint, setEditingBlueprint] = useState<
    CustomBlueprint | "new" | undefined
  >(undefined);

  // Form state
  const [formName, setFormName] = useState("");
  const [formSections, setFormSections] = useState<SectionRow[]>([]);
  const [saving, setSaving] = useState(false);

  // Delete state (controlled AlertDialog)
  const [deleteTarget, setDeleteTarget] = useState<CustomBlueprint | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);

  const fetchBlueprints = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/legal-hub/wizard/blueprints");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch blueprints");
      }
      const data = await res.json();
      setBlueprints(data.blueprints || []);
    } catch (err) {
      console.error("Error fetching blueprints:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to fetch blueprints"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlueprints();
  }, [fetchBlueprints]);

  const handleNew = () => {
    setFormName("");
    setFormSections([]);
    setEditingBlueprint("new");
  };

  const handleEdit = (bp: CustomBlueprint) => {
    setFormName(bp.name);
    setFormSections(parseSections(bp.sections_json));
    setEditingBlueprint(bp);
  };

  const handleCancelEdit = () => {
    setEditingBlueprint(undefined);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/legal-hub/wizard/blueprints/${deleteTarget.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete");
      }
      toast.success("Blueprint deleted");
      setDeleteTarget(null);
      await fetchBlueprints();
    } catch (err) {
      console.error("Error deleting blueprint:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to delete blueprint"
      );
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    const trimmedName = formName.trim();
    if (!trimmedName) {
      toast.error("Name is required");
      return;
    }

    setSaving(true);
    try {
      const sectionsJson = JSON.stringify(
        formSections.map((s) => ({
          title: s.title.trim() || "Untitled",
          sectionKey: s.sectionKey,
        }))
      );

      const isNew = editingBlueprint === "new";
      const url = isNew
        ? "/api/legal-hub/wizard/blueprints"
        : `/api/legal-hub/wizard/blueprints/${(editingBlueprint as CustomBlueprint).id}`;
      const method = isNew ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, sections_json: sectionsJson }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save blueprint");
      }

      toast.success(isNew ? "Blueprint created" : "Blueprint updated");
      setEditingBlueprint(undefined);
      await fetchBlueprints();
    } catch (err) {
      console.error("Error saving blueprint:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to save blueprint"
      );
    } finally {
      setSaving(false);
    }
  };

  // Section manipulation
  const addSection = () => {
    setFormSections((prev) => [...prev, { title: "", sectionKey: null }]);
  };

  const removeSection = (index: number) => {
    setFormSections((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSectionTitle = (index: number, title: string) => {
    setFormSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, title } : s))
    );
  };

  const updateSectionKey = (index: number, sectionKey: string | null) => {
    setFormSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, sectionKey } : s))
    );
  };

  const moveSection = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= formSections.length) return;
    setFormSections((prev) => {
      const arr = [...prev];
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr;
    });
  };

  // ── Edit/Create view ────────────────────────────────────────────────────────
  if (editingBlueprint !== undefined) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancelEdit}
          className="text-muted-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to blueprints
        </Button>

        <h2 className="text-lg font-semibold">
          {editingBlueprint === "new" ? "New Blueprint" : "Edit Blueprint"}
        </h2>

        <div className="space-y-4 max-w-2xl">
          <div>
            <label className="text-sm font-medium mb-1 block">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Blueprint name"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Sections</label>
              <Button variant="outline" size="sm" onClick={addSection}>
                <Plus className="w-4 h-4 mr-1" />
                Add Section
              </Button>
            </div>

            {formSections.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
                No sections yet. Add sections or save as a blank blueprint.
              </p>
            ) : (
              <div className="space-y-2">
                {formSections.map((section, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 border rounded-lg px-3 py-2"
                  >
                    <Input
                      value={section.title}
                      onChange={(e) =>
                        updateSectionTitle(index, e.target.value)
                      }
                      placeholder="Section title"
                      className="flex-1"
                    />
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm shrink-0"
                      value={section.sectionKey || ""}
                      onChange={(e) =>
                        updateSectionKey(
                          index,
                          e.target.value === "" ? null : e.target.value
                        )
                      }
                    >
                      {SECTION_KEY_OPTIONS.map((opt) => (
                        <option
                          key={opt.value ?? "__null__"}
                          value={opt.value || ""}
                        >
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => moveSection(index, "up")}
                      disabled={index === 0}
                      title="Move up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => moveSection(index, "down")}
                      disabled={index === formSections.length - 1}
                      title="Move down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSection(index)}
                      title="Remove section"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Section key affects which variable hints are shown in the wizard.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={saving || !formName.trim()}
              size="sm"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {editingBlueprint === "new"
                ? "Create Blueprint"
                : "Save Changes"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelEdit}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── List view ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-muted-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to templates
        </Button>
        <Button onClick={handleNew} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          New Blueprint
        </Button>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Custom Blueprints</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Create reusable section sets for the template wizard
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : blueprints.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No custom blueprints yet. Create your first blueprint to use in the
          template wizard.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left font-medium px-4 py-3">Name</th>
                <th className="text-left font-medium px-4 py-3">Sections</th>
                <th className="text-left font-medium px-4 py-3">Created</th>
                <th className="text-right font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {blueprints.map((bp) => {
                const sectionCount = parseSections(bp.sections_json).length;
                return (
                  <tr key={bp.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3 font-medium">{bp.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {sectionCount}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(bp.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(bp)}
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(bp)}
                          title="Delete"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation dialog (controlled) */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete blueprint</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;?
              This blueprint will no longer be available in the template wizard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
