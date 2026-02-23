"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface Hunk {
  type: "added" | "removed" | "unchanged";
  lines: string[];
}

interface DiffModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newDocumentId: number;
  oldDocumentId: number;
  newDocumentName: string;
  oldVersion: number;
  newVersion: number;
}

const CONTEXT_LINES = 3;

export function DiffModal({
  open,
  onOpenChange,
  newDocumentId,
  oldDocumentId,
  newDocumentName,
  oldVersion,
  newVersion,
}: DiffModalProps) {
  const [hunks, setHunks] = useState<Hunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedHunks, setExpandedHunks] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setHunks([]);
    setExpandedHunks(new Set());
    fetch(`/api/documents/${newDocumentId}/diff/${oldDocumentId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setHunks(data.hunks || []);
      })
      .catch(() => setError("Failed to load diff"))
      .finally(() => setLoading(false));
  }, [open, newDocumentId, oldDocumentId]);

  function buildDisplaySections() {
    const sections: Array<{
      hunkIndex: number;
      slice?: [number, number];
      collapsed?: boolean;
      count?: number;
    }> = [];

    for (let i = 0; i < hunks.length; i++) {
      const hunk = hunks[i];
      if (hunk.type !== "unchanged") {
        sections.push({ hunkIndex: i });
      } else {
        const isExpanded = expandedHunks.has(i);
        if (isExpanded || hunk.lines.length <= CONTEXT_LINES * 2 + 1) {
          sections.push({ hunkIndex: i });
        } else {
          sections.push({ hunkIndex: i, slice: [0, CONTEXT_LINES] });
          sections.push({ hunkIndex: i, collapsed: true, count: hunk.lines.length - CONTEXT_LINES * 2 });
          sections.push({ hunkIndex: i, slice: [hunk.lines.length - CONTEXT_LINES, hunk.lines.length] });
        }
      }
    }
    return sections;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            {newDocumentName} — v{oldVersion} → v{newVersion}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive p-4">{error}</p>
        )}

        {!loading && !error && hunks.length === 0 && (
          <p className="text-sm text-muted-foreground p-4">No differences found.</p>
        )}

        {!loading && !error && hunks.length > 0 && (
          <div className="overflow-y-auto flex-1 font-mono text-xs border rounded-md">
            {buildDisplaySections().map((section, idx) => {
              const hunk = hunks[section.hunkIndex];
              const lines = section.slice
                ? hunk.lines.slice(section.slice[0], section.slice[1])
                : hunk.lines;

              if (section.collapsed) {
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-1 bg-muted/30 text-muted-foreground border-y"
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-2 text-xs"
                      onClick={() =>
                        setExpandedHunks((prev) => new Set(prev).add(section.hunkIndex))
                      }
                    >
                      Show {section.count} unchanged lines
                    </Button>
                  </div>
                );
              }

              return lines.map((line, lineIdx) => {
                const bg =
                  hunk.type === "added"
                    ? "bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300"
                    : hunk.type === "removed"
                    ? "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300"
                    : "text-muted-foreground";
                const prefix =
                  hunk.type === "added" ? "+" : hunk.type === "removed" ? "-" : " ";

                return (
                  <div key={`${idx}-${lineIdx}`} className={`flex px-3 py-0.5 ${bg}`}>
                    <span className="w-4 shrink-0 select-none opacity-50">{prefix}</span>
                    <span className="whitespace-pre-wrap break-all">{line}</span>
                  </div>
                );
              });
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
