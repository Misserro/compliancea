"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CASE_DOCUMENT_CATEGORIES } from "@/lib/constants";

interface LibraryDocument {
  id: number;
  name: string;
  doc_type: string | null;
  category: string | null;
}

interface AddCaseDocumentDialogProps {
  caseId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function AddCaseDocumentDialog({
  caseId,
  open,
  onOpenChange,
  onSaved,
}: AddCaseDocumentDialogProps) {
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"upload" | "link">("upload");
  const [documentCategory, setDocumentCategory] = useState("other");
  const [label, setLabel] = useState("");
  const [dateFiled, setDateFiled] = useState("");
  const [filingReference, setFilingReference] = useState("");

  // Upload tab state
  const fileRef = useRef<HTMLInputElement>(null);

  // Link tab state
  const [libraryDocs, setLibraryDocs] = useState<LibraryDocument[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);

  // Fetch library documents when the link tab is shown
  useEffect(() => {
    if (open && activeTab === "link" && libraryDocs.length === 0) {
      setLibraryLoading(true);
      fetch("/api/documents")
        .then((res) =>
          res.ok ? res.json() : Promise.reject(new Error("Failed to fetch"))
        )
        .then((data) => {
          setLibraryDocs(data.documents || []);
        })
        .catch((err) => {
          console.warn("Failed to fetch library documents:", err);
        })
        .finally(() => {
          setLibraryLoading(false);
        });
    }
  }, [open, activeTab, libraryDocs.length]);

  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return libraryDocs;
    const q = searchQuery.toLowerCase();
    return libraryDocs.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.doc_type && d.doc_type.toLowerCase().includes(q)) ||
        (d.category && d.category.toLowerCase().includes(q))
    );
  }, [libraryDocs, searchQuery]);

  const resetForm = () => {
    setDocumentCategory("other");
    setLabel("");
    setDateFiled("");
    setFilingReference("");
    setSearchQuery("");
    setSelectedDocId(null);
    setActiveTab("upload");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (activeTab === "upload") {
        const file = fileRef.current?.files?.[0];
        if (!file) {
          toast.error("Wybierz plik");
          setSaving(false);
          return;
        }

        const formData = new FormData();
        formData.append("mode", "upload");
        formData.append("file", file);
        formData.append("document_category", documentCategory);
        if (label.trim()) formData.append("label", label.trim());
        if (dateFiled) formData.append("date_filed", dateFiled);
        if (filingReference.trim())
          formData.append("filing_reference", filingReference.trim());

        const res = await fetch(
          `/api/legal-hub/cases/${caseId}/documents`,
          {
            method: "POST",
            body: formData,
          }
        );
        const data = await res.json();
        if (res.ok) {
          toast.success("Dokument przesłany");
          resetForm();
          onSaved();
          onOpenChange(false);
        } else {
          toast.error(data.error || "Failed to upload document");
        }
      } else {
        // link mode
        if (!selectedDocId) {
          toast.error("Wybierz dokument z biblioteki");
          setSaving(false);
          return;
        }

        const formData = new FormData();
        formData.append("mode", "link");
        formData.append("document_id", String(selectedDocId));
        formData.append("document_category", documentCategory);
        if (label.trim()) formData.append("label", label.trim());
        if (dateFiled) formData.append("date_filed", dateFiled);
        if (filingReference.trim())
          formData.append("filing_reference", filingReference.trim());

        const res = await fetch(
          `/api/legal-hub/cases/${caseId}/documents`,
          {
            method: "POST",
            body: formData,
          }
        );
        const data = await res.json();
        if (res.ok) {
          toast.success("Dokument powiązany");
          resetForm();
          onSaved();
          onOpenChange(false);
        } else {
          toast.error(data.error || "Failed to link document");
        }
      }
    } catch (err) {
      toast.error(
        `Save failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dodaj dokument do sprawy</DialogTitle>
        </DialogHeader>

        {/* Tab buttons */}
        <div className="flex gap-1 p-1 rounded-lg bg-muted">
          <button
            type="button"
            className={cn(
              "flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              activeTab === "upload"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab("upload")}
          >
            Prześlij nowy
          </button>
          <button
            type="button"
            className={cn(
              "flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              activeTab === "link"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab("link")}
          >
            Powiąż istniejący
          </button>
        </div>

        <div className="space-y-4 py-2">
          {activeTab === "upload" && (
            <div>
              <Label htmlFor="case-doc-file">Plik *</Label>
              <Input
                id="case-doc-file"
                type="file"
                accept=".pdf,.docx"
                ref={fileRef}
              />
              <p className="text-xs text-muted-foreground mt-1">
                PDF lub DOCX. Maks. 10 MB. Plik zostanie przetworzony do wyszukiwania tekstowego.
              </p>
            </div>
          )}

          {activeTab === "link" && (
            <div>
              <Label htmlFor="case-doc-search">
                Szukaj w bibliotece dokumentów
              </Label>
              <Input
                id="case-doc-search"
                placeholder="Szukaj po nazwie, typie lub kategorii..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <div className="mt-2 max-h-48 overflow-y-auto rounded border bg-muted/30">
                {libraryLoading ? (
                  <p className="text-sm text-muted-foreground p-3">
                    Ładowanie dokumentów...
                  </p>
                ) : filteredDocs.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3">
                    {searchQuery
                      ? "Brak pasujących dokumentów."
                      : "Brak dokumentów w bibliotece."}
                  </p>
                ) : (
                  filteredDocs.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center justify-between",
                        selectedDocId === doc.id && "bg-muted"
                      )}
                      onClick={() => setSelectedDocId(doc.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{doc.name}</div>
                        {doc.doc_type && (
                          <div className="text-xs text-muted-foreground">
                            {doc.doc_type}
                          </div>
                        )}
                      </div>
                      {selectedDocId === doc.id && (
                        <Check className="w-4 h-4 text-primary flex-shrink-0 ml-2" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Shared fields */}
          <div>
            <Label htmlFor="case-doc-category">Kategoria</Label>
            <Select
              value={documentCategory}
              onValueChange={setDocumentCategory}
            >
              <SelectTrigger id="case-doc-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CASE_DOCUMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="case-doc-label">Etykieta (opcjonalnie)</Label>
            <Input
              id="case-doc-label"
              placeholder="e.g., Pozew, Za\u0142\u0105cznik nr 1"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="case-doc-date-filed">Data złożenia</Label>
              <Input
                id="case-doc-date-filed"
                type="date"
                value={dateFiled}
                onChange={(e) => setDateFiled(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="case-doc-filing-ref">Numer pisma</Label>
              <Input
                id="case-doc-filing-ref"
                placeholder="e.g., I C 123/25"
                value={filingReference}
                onChange={(e) => setFilingReference(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Anuluj
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving
              ? "Zapisywanie..."
              : activeTab === "upload"
              ? "Prześlij"
              : "Powiąż dokument"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
