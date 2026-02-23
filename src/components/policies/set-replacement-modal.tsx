"use client";

import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { Document } from "@/lib/types";

interface SetReplacementModalProps {
  document: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: () => void;
}

export function SetReplacementModal({
  document,
  open,
  onOpenChange,
  onResolved,
}: SetReplacementModalProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/documents")
      .then((r) => r.json())
      .then((data) => setDocuments(data.documents || []));
  }, [open]);

  const filtered = documents.filter(
    (d) =>
      d.id !== document?.id &&
      d.doc_type === document?.doc_type &&
      d.superseded_by === null &&
      d.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleConfirm() {
    if (!selected || !document) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${document.id}/set-replacement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldDocumentId: selected }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        onOpenChange(false);
        onResolved();
      } else {
        toast.error(data.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Set as replacement for…</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Select the document that <strong>{document?.name}</strong> replaces. The selected document will be archived.
        </p>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search documents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-1">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground p-2">No documents found.</p>
          )}
          {filtered.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelected(d.id)}
              className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-muted transition-colors ${
                selected === d.id ? "bg-muted font-medium" : ""
              }`}
            >
              <span>{d.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">v{d.version}</span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selected || loading}>
            Confirm replacement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
