"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, X } from "lucide-react";
import { UploadSection } from "@/components/documents/upload-section";
import { ActionBar } from "@/components/documents/action-bar";
import { DocumentList } from "@/components/documents/document-list";
import { MetadataDialog } from "@/components/documents/metadata-dialog";
import { ContractActionDialog } from "@/components/documents/contract-action-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DOCUMENT_STATUSES, CONTRACT_STATUSES } from "@/lib/constants";
import type { Document } from "@/lib/types";

// All filterable statuses: document statuses + contract statuses (deduped)
const ALL_STATUSES = Array.from(
  new Set([...DOCUMENT_STATUSES, ...CONTRACT_STATUSES])
) as string[];

export default function DocumentsPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [allExpanded, setAllExpanded] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());

  // Search & filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Metadata dialog state
  const [metadataDoc, setMetadataDoc] = useState<Document | null>(null);
  const [metadataOpen, setMetadataOpen] = useState(false);

  // Contract action dialog state
  const [contractDocId, setContractDocId] = useState<number | null>(null);
  const [contractOpen, setContractOpen] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      toast.error(`Failed to load documents: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Filtered documents derived from search + status
  const filteredDocuments = useMemo(() => {
    let result = documents;

    if (statusFilter !== "all") {
      result = result.filter((d) => d.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((d) => d.name.toLowerCase().includes(q));
    }

    return result;
  }, [documents, search, statusFilter]);

  async function handleScanServer() {
    try {
      const res = await fetch("/api/documents/scan", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        setDocuments(data.documents || []);
      } else {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error(`Scan failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  async function handleScanGDrive() {
    try {
      const res = await fetch("/api/gdrive/scan", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        if (data.documents) setDocuments(data.documents);
      } else {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error(`GDrive scan failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  async function handleProcessAll() {
    const unprocessed = documents.filter((d) => !d.processed);
    if (unprocessed.length === 0) {
      toast.info("All documents are already processed.");
      return;
    }

    toast.info(`Processing ${unprocessed.length} document(s)...`);
    let processed = 0;
    let failed = 0;

    for (const doc of unprocessed) {
      setProcessingIds((prev) => new Set(prev).add(doc.id));
      try {
        const res = await fetch(`/api/documents/${doc.id}/process`, { method: "POST" });
        if (res.ok) {
          processed++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(doc.id);
        return next;
      });
    }

    toast.success(`Processed ${processed}, failed ${failed}`);
    await loadDocuments();
  }

  async function handleRetagAll() {
    try {
      const res = await fetch("/api/documents/retag-all", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        await loadDocuments();
      } else {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error(`Retag failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  async function handleCategoryChange(id: number, category: string | null) {
    try {
      const res = await fetch(`/api/documents/${id}/category`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments((prev) =>
          prev.map((d) => (d.id === id ? data.document : d))
        );
      }
    } catch (err) {
      toast.error(`Failed to update category: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  async function handleProcess(id: number) {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/documents/${id}/process`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Document processed");
        await loadDocuments();
      } else {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error(`Process failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== id));
        toast.success("Document deleted");
      } else {
        const data = await res.json();
        toast.error(data.error);
      }
    } catch (err) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  async function handleSaveMetadata(id: number, metadata: Record<string, unknown>) {
    const res = await fetch(`/api/documents/${id}/metadata`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    });
    const data = await res.json();
    if (res.ok) {
      setDocuments((prev) =>
        prev.map((d) => (d.id === id ? data.document : d))
      );
      toast.success("Metadata saved");
    } else {
      toast.error(data.error || "Failed to save metadata");
    }
  }

  function handleStatusMessage(message: string, type: "success" | "error" | "info") {
    if (type === "success") toast.success(message);
    else if (type === "error") toast.error(message);
    else toast.info(message);
  }

  const hasActiveFilters = search.trim() !== "" || statusFilter !== "all";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Documents</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Upload, process, and manage your document library.
        </p>
      </div>

      <UploadSection
        onUploadComplete={loadDocuments}
        onStatusMessage={handleStatusMessage}
      />

      <ActionBar
        onScanServer={handleScanServer}
        onScanGDrive={handleScanGDrive}
        onProcessAll={handleProcessAll}
        onRetagAll={handleRetagAll}
        allExpanded={allExpanded}
        onToggleExpand={() => setAllExpanded(!allExpanded)}
      />

      {/* Search & filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[160px] text-sm">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Active filter summary + clear */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {filteredDocuments.length} of {documents.length} document{documents.length !== 1 ? "s" : ""}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => { setSearch(""); setStatusFilter("all"); }}
            >
              <X className="h-3 w-3 mr-1" />
              Clear filters
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading documents...</p>
      ) : (
        <DocumentList
          documents={filteredDocuments}
          allExpanded={allExpanded}
          processingIds={processingIds}
          onCategoryChange={handleCategoryChange}
          onProcess={handleProcess}
          onDelete={handleDelete}
          onEditMetadata={(doc) => {
            setMetadataDoc(doc);
            setMetadataOpen(true);
          }}
          onManageContract={(docId) => {
            setContractDocId(docId);
            setContractOpen(true);
          }}
        />
      )}

      <MetadataDialog
        document={metadataDoc}
        open={metadataOpen}
        onOpenChange={setMetadataOpen}
        onSave={handleSaveMetadata}
      />

      <ContractActionDialog
        docId={contractDocId}
        open={contractOpen}
        onOpenChange={setContractOpen}
        onNavigateToObligations={() => router.push("/obligations")}
        onRefreshDocuments={loadDocuments}
      />
    </div>
  );
}
