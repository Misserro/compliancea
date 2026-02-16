"use client";

import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DEPARTMENTS } from "@/lib/constants";
import type { Document } from "@/lib/types";

interface DocumentSelectListProps {
  documents: Document[];
  selectedIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
  maxHeight?: string;
}

interface GroupedDocs {
  category: string;
  docs: Document[];
}

export function DocumentSelectList({
  documents,
  selectedIds,
  onSelectionChange,
  maxHeight = "300px",
}: DocumentSelectListProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, Document[]>();

    // Initialize with department order
    for (const dept of DEPARTMENTS) {
      map.set(dept, []);
    }
    map.set("Uncategorized", []);

    for (const doc of documents) {
      const cat = doc.category || "Uncategorized";
      const key = (DEPARTMENTS as readonly string[]).includes(cat)
        ? cat
        : "Uncategorized";
      const list = map.get(key);
      if (list) {
        list.push(doc);
      } else {
        map.set(key, [doc]);
      }
    }

    const result: GroupedDocs[] = [];
    for (const [category, docs] of map.entries()) {
      if (docs.length > 0) {
        result.push({ category, docs });
      }
    }
    return result;
  }, [documents]);

  function handleCategoryToggle(docs: Document[], checked: boolean) {
    const next = new Set(selectedIds);
    for (const doc of docs) {
      if (checked) {
        next.add(doc.id);
      } else {
        next.delete(doc.id);
      }
    }
    onSelectionChange(next);
  }

  function handleDocToggle(docId: number, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(docId);
    } else {
      next.delete(docId);
    }
    onSelectionChange(next);
  }

  function getCategoryState(docs: Document[]): "checked" | "unchecked" | "indeterminate" {
    const selectedCount = docs.filter((d) => selectedIds.has(d.id)).length;
    if (selectedCount === 0) return "unchecked";
    if (selectedCount === docs.length) return "checked";
    return "indeterminate";
  }

  if (documents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No documents available.
      </p>
    );
  }

  return (
    <ScrollArea className="rounded-md border" style={{ maxHeight }}>
      <div className="p-3 space-y-3">
        {grouped.map(({ category, docs }) => {
          const state = getCategoryState(docs);
          return (
            <div key={category}>
              <div className="flex items-center gap-2 mb-1">
                <Checkbox
                  checked={state === "checked" ? true : state === "indeterminate" ? "indeterminate" : false}
                  onCheckedChange={(checked) => {
                    handleCategoryToggle(docs, !!checked);
                  }}
                />
                <span className="text-sm font-medium">{category}</span>
                <span className="text-xs text-muted-foreground">
                  ({docs.filter((d) => selectedIds.has(d.id)).length}/{docs.length})
                </span>
              </div>
              <div className="ml-6 space-y-1">
                {docs.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedIds.has(doc.id)}
                      onCheckedChange={(checked) => {
                        handleDocToggle(doc.id, !!checked);
                      }}
                    />
                    <span className="text-sm truncate" title={doc.name}>
                      {doc.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
