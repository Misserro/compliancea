"use client";

import { useState, useEffect } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CaseTemplate } from "@/lib/types";

interface TemplateListProps {
  refreshTrigger: number;
  onEdit: (template: CaseTemplate) => void;
  onDeleted: () => void;
}

export function TemplateList({
  refreshTrigger,
  onEdit,
  onDeleted,
}: TemplateListProps) {
  const [templates, setTemplates] = useState<CaseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/legal-hub/templates");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Nie udało się załadować szablonów");
        }
        const data = await res.json();
        setTemplates(data.templates || []);
      } catch (err) {
        console.error("Error fetching templates:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch");
      } finally {
        setLoading(false);
      }
    };
    fetchTemplates();
  }, [refreshTrigger]);

  const handleDelete = async (template: CaseTemplate) => {
    if (
      !window.confirm(
        `Czy na pewno chcesz usunąć szablon "${template.name}"?`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/legal-hub/templates/${template.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Nie udało się usunąć");
      }
      onDeleted();
    } catch (err) {
      console.error("Error deleting template:", err);
      alert(err instanceof Error ? err.message : "Nie udało się usunąć szablonu");
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Brak szablonów. Utwórz pierwszy szablon, aby rozpocząć generowanie dokumentów.
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="text-left font-medium px-4 py-3">Nazwa</th>
            <th className="text-left font-medium px-4 py-3">Typ</th>
            <th className="text-left font-medium px-4 py-3">Status</th>
            <th className="text-left font-medium px-4 py-3">Utworzono</th>
            <th className="text-right font-medium px-4 py-3">Akcje</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((template) => (
            <tr key={template.id} className="border-b last:border-b-0">
              <td className="px-4 py-3">
                <div className="font-medium">{template.name}</div>
                {template.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {template.description}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {template.document_type || "-"}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                    template.is_active
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {template.is_active ? "Aktywny" : "Nieaktywny"}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {new Date(template.created_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(template)}
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  {!template.is_system_template && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(template)}
                      title="Delete"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
