"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DEPARTMENTS } from "@/lib/constants";
import type { Document } from "@/lib/types";

interface EvidenceDialogProps {
  obligationId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEvidenceAdded: () => void;
}

export function EvidenceDialog({
  obligationId,
  open,
  onOpenChange,
  onEvidenceAdded,
}: EvidenceDialogProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      fetch("/api/documents")
        .then((r) => r.json())
        .then((data) => {
          setDocuments(
            (data.documents || []).filter((d: Document) => d.processed)
          );
        })
        .catch(() => setDocuments([]));
      setSelectedDocId(null);
      setNote("");
    }
  }, [open]);

  async function handleAdd() {
    if (!obligationId || !selectedDocId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/obligations/${obligationId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: selectedDocId, note: note || null }),
      });
      if (res.ok) {
        onEvidenceAdded();
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  }

  // Group docs by category
  const grouped: Record<string, Document[]> = {};
  const uncategorized: Document[] = [];
  for (const doc of documents) {
    if (doc.category && DEPARTMENTS.includes(doc.category as (typeof DEPARTMENTS)[number])) {
      if (!grouped[doc.category]) grouped[doc.category] = [];
      grouped[doc.category].push(doc);
    } else {
      uncategorized.push(doc);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Evidence Document</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[300px]">
          <div className="space-y-3">
            {DEPARTMENTS.map((dept) => {
              const docs = grouped[dept];
              if (!docs || docs.length === 0) return null;
              return (
                <div key={dept}>
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    {dept}
                  </div>
                  {docs.map((doc) => (
                    <button
                      key={doc.id}
                      className={`w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors ${
                        selectedDocId === doc.id
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                      onClick={() => setSelectedDocId(doc.id)}
                    >
                      {doc.name}
                    </button>
                  ))}
                </div>
              );
            })}
            {uncategorized.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Uncategorized
                </div>
                {uncategorized.map((doc) => (
                  <button
                    key={doc.id}
                    className={`w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors ${
                      selectedDocId === doc.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => setSelectedDocId(doc.id)}
                  >
                    {doc.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <div>
          <Label htmlFor="evidence-note">Note (optional)</Label>
          <Input
            id="evidence-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note..."
            className="mt-1.5"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!selectedDocId || saving}>
            {saving ? "Adding..." : "Add Evidence"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
