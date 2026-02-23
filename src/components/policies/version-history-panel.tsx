"use client";

import { useState, useEffect } from "react";
import { GitBranch, CheckCircle, Archive, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DiffModal } from "./diff-modal";
import type { DocumentVersion } from "@/lib/types";

interface VersionHistoryPanelProps {
  documentId: number;
  documentName: string;
}

export function VersionHistoryPanel({ documentId, documentName }: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffPair, setDiffPair] = useState<{
    newId: number;
    oldId: number;
    newV: number;
    oldV: number;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/documents/${documentId}/versions`)
      .then((r) => r.json())
      .then((data) => setVersions(data.versions || []))
      .finally(() => setLoading(false));
  }, [documentId]);

  if (loading) {
    return (
      <div className="space-y-2 p-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (versions.length <= 1) {
    return (
      <p className="text-xs text-muted-foreground p-3">No previous versions.</p>
    );
  }

  return (
    <div className="p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
        <GitBranch className="h-3.5 w-3.5" />
        Version history
      </div>

      {versions.map((v, idx) => {
        const isCurrent = v.in_force === "true";
        const next = versions[idx - 1]; // versions are newest-first, so idx-1 is the next newer version

        return (
          <div key={v.id} className="flex items-center gap-2 py-1.5 text-sm">
            {isCurrent ? (
              <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
            ) : (
              <Archive className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <span className="font-medium w-6 text-xs shrink-0">v{v.version}</span>
            <span className="flex-1 text-xs text-muted-foreground truncate">
              {new Date(v.added_at).toLocaleDateString()}
            </span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full ${
                isCurrent
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
              }`}
            >
              {isCurrent ? "Active" : "Archived"}
            </span>
            {next && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  setDiffPair({ newId: next.id, oldId: v.id, newV: next.version, oldV: v.version });
                  setDiffOpen(true);
                }}
              >
                <GitCompare className="h-3 w-3 mr-1" />
                Diff
              </Button>
            )}
          </div>
        );
      })}

      {diffPair && (
        <DiffModal
          open={diffOpen}
          onOpenChange={setDiffOpen}
          newDocumentId={diffPair.newId}
          oldDocumentId={diffPair.oldId}
          newDocumentName={documentName}
          oldVersion={diffPair.oldV}
          newVersion={diffPair.newV}
        />
      )}
    </div>
  );
}
