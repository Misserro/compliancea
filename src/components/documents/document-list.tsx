"use client";

import { DocumentCard } from "./document-card";
import { DEPARTMENTS } from "@/lib/constants";
import type { Document } from "@/lib/types";

interface DocumentListProps {
  documents: Document[];
  allExpanded: boolean;
  processingIds: Set<number>;
  onCategoryChange: (id: number, category: string | null) => void;
  onProcess: (id: number) => void;
  onDelete: (id: number) => void;
  onEditMetadata: (doc: Document) => void;
  onManageContract: (docId: number) => void;
}

export function DocumentList({
  documents,
  allExpanded,
  processingIds,
  onCategoryChange,
  onProcess,
  onDelete,
  onEditMetadata,
  onManageContract,
}: DocumentListProps) {
  // Group documents by department
  const grouped: Record<string, Document[]> = {};
  const uncategorized: Document[] = [];

  for (const doc of documents) {
    if (doc.category && DEPARTMENTS.includes(doc.category as typeof DEPARTMENTS[number])) {
      if (!grouped[doc.category]) grouped[doc.category] = [];
      grouped[doc.category].push(doc);
    } else {
      uncategorized.push(doc);
    }
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No documents in the library.</p>
        <p className="text-sm mt-1">Upload files or scan a folder to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {DEPARTMENTS.map((dept) => {
        const docs = grouped[dept];
        if (!docs || docs.length === 0) return null;

        return (
          <div key={dept}>
            <h3 className="text-sm font-medium text-muted-foreground mb-2 px-1">
              {dept}
              <span className="ml-2 text-xs">({docs.length})</span>
            </h3>
            <div className="space-y-2">
              {docs.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  expanded={allExpanded}
                  processing={processingIds?.has(doc.id) ? true : false}
                  onCategoryChange={onCategoryChange}
                  onProcess={onProcess}
                  onDelete={onDelete}
                  onEditMetadata={onEditMetadata}
                  onManageContract={onManageContract}
                />
              ))}
            </div>
          </div>
        );
      })}

      {uncategorized.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2 px-1">
            Uncategorized
            <span className="ml-2 text-xs">({uncategorized.length})</span>
          </h3>
          <div className="space-y-2">
            {uncategorized.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                expanded={allExpanded}
                processing={processingIds?.has(doc.id) ? true : false}
                onCategoryChange={onCategoryChange}
                onProcess={onProcess}
                onDelete={onDelete}
                onEditMetadata={onEditMetadata}
                onManageContract={onManageContract}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
