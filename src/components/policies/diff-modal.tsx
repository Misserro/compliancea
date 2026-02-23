"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

interface Hunk {
  type: "added" | "removed" | "unchanged";
  lines: string[];
}

interface ChangeBlock {
  label: string | null;
  contextBefore: string[];
  removed: string[];
  added: string[];
  contextAfter: string[];
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

const CONTEXT = 3;

/** Look backwards through unchanged lines to find the nearest section heading. */
function findSectionLabel(lines: string[]): string | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    // Numbered section: "8.3 Retention Period", "4.2.1 Something"
    if (/^\d+(\.\d+)*\s+\S/.test(line)) return line.slice(0, 100);
    // "Section 4", "Chapter 2", "Article 3"
    if (/^(section|chapter|article|clause|part)\s+\d+/i.test(line)) return line.slice(0, 100);
    // ALL CAPS heading (minimum 4 chars, has at least one letter)
    if (line.length >= 4 && line === line.toUpperCase() && /[A-Z]/.test(line)) return line.slice(0, 100);
    // Only look at the single nearest non-empty line — don't scan further
    break;
  }
  return null;
}

function buildChangeBlocks(hunks: Hunk[]): ChangeBlock[] {
  const blocks: ChangeBlock[] = [];
  let i = 0;

  while (i < hunks.length) {
    if (hunks[i].type === "unchanged") {
      i++;
      continue;
    }

    // Preceding unchanged hunk (for context + label)
    const prevUnchanged = i > 0 && hunks[i - 1].type === "unchanged" ? hunks[i - 1].lines : [];
    const contextBefore = prevUnchanged.slice(-CONTEXT);
    const label = findSectionLabel(prevUnchanged);

    // Collect all consecutive changed hunks
    const removed: string[] = [];
    const added: string[] = [];
    while (i < hunks.length && hunks[i].type !== "unchanged") {
      if (hunks[i].type === "removed") removed.push(...hunks[i].lines);
      else if (hunks[i].type === "added") added.push(...hunks[i].lines);
      i++;
    }

    // Following unchanged hunk (for context after)
    const nextUnchanged = i < hunks.length && hunks[i].type === "unchanged" ? hunks[i].lines : [];
    const contextAfter = nextUnchanged.slice(0, CONTEXT);

    blocks.push({ label, contextBefore, removed, added, contextAfter });
  }

  return blocks;
}

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

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setHunks([]);
    fetch(`/api/documents/${newDocumentId}/diff/${oldDocumentId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setHunks(data.hunks || []);
      })
      .catch(() => setError("Failed to load diff"))
      .finally(() => setLoading(false));
  }, [open, newDocumentId, oldDocumentId]);

  const blocks = buildChangeBlocks(hunks);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
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

        {error && <p className="text-sm text-destructive p-4">{error}</p>}

        {!loading && !error && blocks.length === 0 && (
          <p className="text-sm text-muted-foreground p-4">No differences found.</p>
        )}

        {!loading && !error && blocks.length > 0 && (
          <div className="overflow-y-auto flex-1 space-y-3 pr-1">
            <p className="text-xs text-muted-foreground px-1">
              {blocks.length} change{blocks.length !== 1 ? "s" : ""} found
            </p>

            {blocks.map((block, blockIdx) => (
              <div key={blockIdx} className="border rounded-md overflow-hidden">
                {/* Section label */}
                {block.label && (
                  <div className="px-3 py-1.5 bg-muted/50 border-b text-xs font-medium text-muted-foreground truncate">
                    § {block.label}
                  </div>
                )}

                <div className="font-mono text-xs">
                  {/* Context before */}
                  {block.contextBefore.map((line, idx) => (
                    <div key={`cb-${idx}`} className="flex px-3 py-0.5 text-muted-foreground/70">
                      <span className="w-4 shrink-0 select-none"> </span>
                      <span className="whitespace-pre-wrap break-all">{line}</span>
                    </div>
                  ))}

                  {/* Removed lines */}
                  {block.removed.map((line, idx) => (
                    <div key={`r-${idx}`} className="flex px-3 py-0.5 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300">
                      <span className="w-4 shrink-0 select-none">−</span>
                      <span className="whitespace-pre-wrap break-all">{line}</span>
                    </div>
                  ))}

                  {/* Added lines */}
                  {block.added.map((line, idx) => (
                    <div key={`a-${idx}`} className="flex px-3 py-0.5 bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300">
                      <span className="w-4 shrink-0 select-none">+</span>
                      <span className="whitespace-pre-wrap break-all">{line}</span>
                    </div>
                  ))}

                  {/* Context after */}
                  {block.contextAfter.map((line, idx) => (
                    <div key={`ca-${idx}`} className="flex px-3 py-0.5 text-muted-foreground/70">
                      <span className="w-4 shrink-0 select-none"> </span>
                      <span className="whitespace-pre-wrap break-all">{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
