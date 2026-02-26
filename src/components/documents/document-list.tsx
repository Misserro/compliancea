"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DocumentCard } from "./document-card";
import { DEPARTMENTS, DOC_TYPES } from "@/lib/constants";
import type { Document } from "@/lib/types";

interface DocumentListProps {
  documents: Document[];
  allExpanded: boolean;
  processingIds: Set<number>;
  retaggingIds: Set<number>;
  onCategoryChange: (id: number, category: string | null) => void;
  onProcess: (id: number) => void;
  onRetag: (id: number) => void;
  onDelete: (id: number) => void;
  onEditMetadata: (doc: Document) => void;
  onManageContract: (docId: number) => void;
}

// Normalise doc_type for display — "agreement" shows as "contract"
function normaliseDocType(raw: string | null | undefined): string {
  if (!raw) return "other";
  if (raw === "agreement") return "contract";
  return raw;
}

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Doc-type sub-section ──────────────────────────────────────────────────────

interface DocTypeSectionProps {
  docType: string;
  docs: Document[];
  allExpanded: boolean;
  processingIds: Set<number>;
  retaggingIds: Set<number>;
  onCategoryChange: (id: number, category: string | null) => void;
  onProcess: (id: number) => void;
  onRetag: (id: number) => void;
  onDelete: (id: number) => void;
  onEditMetadata: (doc: Document) => void;
  onManageContract: (docId: number) => void;
}

function DocTypeSection({
  docType,
  docs,
  allExpanded,
  processingIds,
  retaggingIds,
  onCategoryChange,
  onProcess,
  onRetag,
  onDelete,
  onEditMetadata,
  onManageContract,
}: DocTypeSectionProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="ml-4 mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-1.5 group"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground/70 group-hover:text-foreground/70 transition-colors" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground/70 group-hover:text-foreground/70 transition-colors" />
        )}
        <span className="uppercase tracking-wide text-[11px]">{titleCase(docType)}</span>
        <span className="text-[11px] opacity-60">({docs.length})</span>
      </button>

      {open && (
        <div className="space-y-2">
          {docs.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              expanded={allExpanded}
              processing={processingIds?.has(doc.id) ?? false}
              retagging={retaggingIds?.has(doc.id) ?? false}
              onCategoryChange={onCategoryChange}
              onProcess={onProcess}
              onRetag={onRetag}
              onDelete={onDelete}
              onEditMetadata={onEditMetadata}
              onManageContract={onManageContract}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Department section ────────────────────────────────────────────────────────

interface DeptSectionProps {
  dept: string;
  docs: Document[];
  allExpanded: boolean;
  processingIds: Set<number>;
  retaggingIds: Set<number>;
  onCategoryChange: (id: number, category: string | null) => void;
  onProcess: (id: number) => void;
  onRetag: (id: number) => void;
  onDelete: (id: number) => void;
  onEditMetadata: (doc: Document) => void;
  onManageContract: (docId: number) => void;
}

function DeptSection({
  dept,
  docs,
  allExpanded,
  processingIds,
  retaggingIds,
  onCategoryChange,
  onProcess,
  onRetag,
  onDelete,
  onEditMetadata,
  onManageContract,
}: DeptSectionProps) {
  const [open, setOpen] = useState(true);

  // Group docs within this dept by normalised doc_type
  const byType: Record<string, Document[]> = {};
  for (const doc of docs) {
    const t = normaliseDocType(doc.doc_type);
    if (!byType[t]) byType[t] = [];
    byType[t].push(doc);
  }

  // Order: known types first (in DOC_TYPES order, deduped), then unknowns
  const knownOrder: string[] = Array.from(
    new Set(DOC_TYPES.map((t) => (t === "agreement" ? "contract" : t)))
  );
  const presentTypes = Object.keys(byType);
  const orderedTypes = [
    ...knownOrder.filter((t) => presentTypes.includes(t)),
    ...presentTypes.filter((t) => !knownOrder.includes(t)),
  ];

  const sharedProps = {
    allExpanded,
    processingIds,
    retaggingIds,
    onCategoryChange,
    onProcess,
    onRetag,
    onDelete,
    onEditMetadata,
    onManageContract,
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Department header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold">{dept}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {docs.length} document{docs.length !== 1 ? "s" : ""}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-1">
          {orderedTypes.map((type) => (
            <DocTypeSection
              key={type}
              docType={type}
              docs={byType[type]}
              {...sharedProps}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Root DocumentList ─────────────────────────────────────────────────────────

export function DocumentList({
  documents,
  allExpanded,
  processingIds,
  retaggingIds,
  onCategoryChange,
  onProcess,
  onRetag,
  onDelete,
  onEditMetadata,
  onManageContract,
}: DocumentListProps) {
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
        <p>No documents found.</p>
        <p className="text-sm mt-1">Try adjusting your search or filters.</p>
      </div>
    );
  }

  const sharedProps = {
    allExpanded,
    processingIds,
    retaggingIds,
    onCategoryChange,
    onProcess,
    onRetag,
    onDelete,
    onEditMetadata,
    onManageContract,
  };

  return (
    <div className="space-y-3">
      {DEPARTMENTS.map((dept) => {
        const docs = grouped[dept];
        if (!docs || docs.length === 0) return null;
        return <DeptSection key={dept} dept={dept} docs={docs} {...sharedProps} />;
      })}

      {uncategorized.length > 0 && (
        <DeptSection dept="Uncategorized" docs={uncategorized} {...sharedProps} />
      )}
    </div>
  );
}
