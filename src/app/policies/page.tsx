"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PoliciesList } from "@/components/policies/policies-list";
import { isInForce } from "@/lib/utils";
import type { Document } from "@/lib/types";

interface PendingReplacement {
  id: number;
  new_document_id: number;
  candidate_id: number;
  confidence: number;
  candidate_name: string;
  candidate_version: number;
}

export default function PoliciesPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [pendingReplacements, setPendingReplacements] = useState<PendingReplacement[]>([]);
  const [docTypes, setDocTypes] = useState<string[]>(["policy", "procedure"]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [docsRes, pendingRes, settingsRes] = await Promise.all([
        fetch("/api/documents"),
        fetch("/api/documents/pending-replacements"),
        fetch("/api/settings"),
      ]);

      if (docsRes.ok) {
        const data = await docsRes.json();
        setDocuments(data.documents || []);
      }
      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setPendingReplacements(data.pending || []);
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        if (data.policiesTabDocTypes) setDocTypes(data.policiesTabDocTypes);
      }
    } catch (err) {
      toast.error(`Failed to load: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    let result = documents.filter((d) => d.doc_type && docTypes.includes(d.doc_type));

    if (activeOnly) {
      result = result.filter((d) => isInForce(d.in_force) && !d.superseded_by && d.status !== "archived");
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((d) => d.name.toLowerCase().includes(q));
    }

    // Sort: active first, then archived, then alphabetical
    result.sort((a, b) => {
      const aActive = isInForce(a.in_force) && !a.superseded_by && a.status !== "archived";
      const bActive = isInForce(b.in_force) && !b.superseded_by && b.status !== "archived";
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [documents, docTypes, activeOnly, search]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Policies</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Policies, procedures, and other controlled documents with version history.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
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
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Switch id="active-only" checked={activeOnly} onCheckedChange={setActiveOnly} />
          <Label htmlFor="active-only" className="text-sm cursor-pointer">
            Active only
          </Label>
        </div>
        <span className="text-xs text-muted-foreground">
          {filtered.length} document{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : (
        <PoliciesList
          documents={filtered}
          pendingReplacements={pendingReplacements}
          onRefresh={loadData}
        />
      )}
    </div>
  );
}
