"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { CONTRACT_DOCUMENT_TYPES } from "@/lib/constants";

interface LibraryDocument {
  id: number;
  name: string;
  doc_type: string | null;
  category: string | null;
}

interface AddContractDocumentDialogProps {
  contractId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function AddContractDocumentDialog({
  contractId,
  open,
  onOpenChange,
  onSaved,
}: AddContractDocumentDialogProps) {
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"upload" | "link">("upload");
  const [documentType, setDocumentType] = useState("other");
  const [label, setLabel] = useState("");
  const t = useTranslations("Contracts");
  const tCommon = useTranslations("Common");

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
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to fetch"))))
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
    setDocumentType("other");
    setLabel("");
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
          toast.error(t("addDocumentDialog.selectFile"));
          setSaving(false);
          return;
        }

        const formData = new FormData();
        formData.append("mode", "upload");
        formData.append("file", file);
        formData.append("document_type", documentType);
        if (label.trim()) formData.append("label", label.trim());

        const res = await fetch(`/api/contracts/${contractId}/documents`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (res.ok) {
          toast.success(t("addDocumentDialog.uploaded"));
          resetForm();
          onSaved();
          onOpenChange(false);
        } else {
          toast.error(data.error || t("documents.removeFailed"));
        }
      } else {
        // link mode
        if (!selectedDocId) {
          toast.error(t("addDocumentDialog.selectDocument"));
          setSaving(false);
          return;
        }

        const formData = new FormData();
        formData.append("mode", "link");
        formData.append("document_id", String(selectedDocId));
        formData.append("document_type", documentType);
        if (label.trim()) formData.append("label", label.trim());

        const res = await fetch(`/api/contracts/${contractId}/documents`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (res.ok) {
          toast.success(t("addDocumentDialog.linked"));
          resetForm();
          onSaved();
          onOpenChange(false);
        } else {
          toast.error(data.error || t("documents.removeFailed"));
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("addDocumentDialog.title")}</DialogTitle>
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
            {t("addDocumentDialog.uploadNew")}
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
            {t("addDocumentDialog.linkExisting")}
          </button>
        </div>

        <div className="space-y-4 py-2">
          {activeTab === "upload" && (
            <div>
              <Label htmlFor="contract-doc-file">{t("addDocumentDialog.file")}</Label>
              <Input
                id="contract-doc-file"
                type="file"
                accept=".pdf,.docx"
                ref={fileRef}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("addDocumentDialog.fileHint")}
              </p>
            </div>
          )}

          {activeTab === "link" && (
            <div>
              <Label htmlFor="contract-doc-search">{t("addDocumentDialog.searchLibrary")}</Label>
              <Input
                id="contract-doc-search"
                placeholder={t("addDocumentDialog.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <div className="mt-2 max-h-48 overflow-y-auto rounded border bg-muted/30">
                {libraryLoading ? (
                  <p className="text-sm text-muted-foreground p-3">{t("addDocumentDialog.loadingDocs")}</p>
                ) : filteredDocs.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3">
                    {searchQuery ? t("addDocumentDialog.noMatchingDocs") : t("addDocumentDialog.noLibraryDocs")}
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
                          <div className="text-xs text-muted-foreground">{doc.doc_type}</div>
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
            <Label htmlFor="contract-doc-type">{t("addDocumentDialog.documentType")}</Label>
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger id="contract-doc-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTRACT_DOCUMENT_TYPES.map((docType) => (
                  <SelectItem key={docType.value} value={docType.value}>
                    {t(`documentType.${docType.value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="contract-doc-label">{t("addDocumentDialog.labelOptional")}</Label>
            <Input
              id="contract-doc-label"
              placeholder={t("addDocumentDialog.labelPlaceholder")}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving
              ? t("addDocumentDialog.saving")
              : activeTab === "upload"
              ? t("addDocumentDialog.upload")
              : t("addDocumentDialog.linkDocument")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
