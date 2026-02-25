"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Document } from "@/lib/types";

const FILTER_CATEGORIES = [
  { label: 'All', value: 'all' },
  { label: 'Regulatory & Compliance', value: 'regulatory', types: ['regulation', 'compliance', 'standard'] },
  { label: 'Specifications', value: 'specs', types: ['prd', 'specification', 'architecture', 'report'] },
  { label: 'User Research', value: 'research', types: ['research', 'feedback'] },
  { label: 'Contracts / SLAs', value: 'contracts', types: ['contract', 'sla'] },
];

interface Step2DocumentContextProps {
  selectedDocIds: number[];
  freeContext: string;
  onChange: (docIds: number[], freeContext: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function Step2DocumentContext({ selectedDocIds, freeContext, onChange, onBack, onContinue }: Step2DocumentContextProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/documents')
      .then(r => r.json())
      .then(d => setDocuments((d.documents || []).filter((doc: Document) => doc.processed)));
  }, []);

  const filtered = useMemo(() => {
    let result = documents;
    if (activeFilter !== 'all') {
      const cat = FILTER_CATEGORIES.find(c => c.value === activeFilter);
      if (cat?.types) result = result.filter(d => d.doc_type && cat.types!.includes(d.doc_type));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(d => d.name.toLowerCase().includes(q));
    }
    return result;
  }, [documents, activeFilter, search]);

  function toggleDoc(id: number) {
    const next = selectedDocIds.includes(id)
      ? selectedDocIds.filter(d => d !== id)
      : [...selectedDocIds, id];
    onChange(next, freeContext);
  }

  const hoveredDoc = hoveredId ? documents.find(d => d.id === hoveredId) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: document picker */}
        <div className="lg:col-span-2 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Select Reference Documents</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Choose documents from your Drive library to include as context.</p>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2">
            {FILTER_CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setActiveFilter(cat.value)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                  activeFilter === cat.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-muted-foreground/30 hover:border-primary/50",
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search documents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Document list */}
          <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground p-4 text-center">No documents found.</p>
            ) : filtered.map(doc => {
              const selected = selectedDocIds.includes(doc.id);
              return (
                <button
                  key={doc.id}
                  onClick={() => toggleDoc(doc.id)}
                  onMouseEnter={() => setHoveredId(doc.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors",
                    selected && "bg-primary/5",
                  )}
                >
                  <div className={cn(
                    "h-4 w-4 rounded border-2 flex-shrink-0 transition-colors",
                    selected ? "bg-primary border-primary" : "border-muted-foreground/40",
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{doc.name}</p>
                    <div className="flex gap-2 mt-0.5">
                      {doc.doc_type && <span className="text-[10px] text-muted-foreground">{doc.doc_type}</span>}
                      {doc.added_at && <span className="text-[10px] text-muted-foreground">{new Date(doc.added_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: summary + preview */}
        <div className="space-y-3">
          <div className="border rounded-lg p-3 bg-muted/20 space-y-1">
            <p className="text-xs font-semibold">Selection Summary</p>
            <p className="text-xs text-muted-foreground">
              {selectedDocIds.length} document{selectedDocIds.length !== 1 ? 's' : ''} selected
              {freeContext.trim() ? ` + free text (${freeContext.trim().length} chars)` : ''}
            </p>
            {selectedDocIds.length > 0 && (
              <div className="pt-1 space-y-1">
                {selectedDocIds.map(id => {
                  const doc = documents.find(d => d.id === id);
                  return doc ? (
                    <div key={id} className="flex items-center justify-between gap-2">
                      <span className="text-[11px] truncate">{doc.name}</span>
                      <button onClick={() => toggleDoc(id)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : null;
                })}
              </div>
            )}
          </div>

          {/* Hover preview */}
          {hoveredDoc && (
            <div className="border rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold truncate">{hoveredDoc.name}</p>
              <p className="text-[11px] text-muted-foreground line-clamp-4">
                {hoveredDoc.full_text?.slice(0, 300) ?? 'No preview available.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Free context */}
      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold">Additional Context</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Paste emails, Slack messages, meeting notes, or stakeholder requests.</p>
        </div>
        <textarea
          value={freeContext}
          onChange={(e) => onChange(selectedDocIds, e.target.value)}
          rows={5}
          placeholder="Paste any additional context here…"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground text-right">{freeContext.length} chars</p>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>← Back</Button>
        <Button onClick={onContinue}>Continue to Templates →</Button>
      </div>
    </div>
  );
}
