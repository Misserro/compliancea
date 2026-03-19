"use client";

import * as HoverCard from "@radix-ui/react-hover-card";
import { ExternalLink } from "lucide-react";

export interface CitationRecord {
  chunkId: number;
  documentId: number;
  documentName: string;
  page: number | null;
  sentenceHit: string;
  sentenceBefore: string;
  sentenceAfter: string;
}

interface CitationHoverCardProps {
  citation: CitationRecord;
  children: React.ReactNode;
}

export function CitationHoverCard({
  citation,
  children,
}: CitationHoverCardProps) {
  return (
    <HoverCard.Root openDelay={300} closeDelay={150}>
      <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="top"
          align="start"
          sideOffset={6}
          avoidCollisions
          className="z-50 max-w-[320px] rounded-md border bg-popover p-3 shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
        >
          <div className="max-h-[200px] overflow-y-auto space-y-2">
            {/* Header: document name + page badge */}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-popover-foreground truncate">
                {citation.documentName}
              </span>
              {citation.page != null && (
                <span className="shrink-0 text-[11px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                  p. {citation.page}
                </span>
              )}
            </div>

            {/* 3-sentence context */}
            <div className="space-y-1">
              {citation.sentenceBefore && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {citation.sentenceBefore}
                </p>
              )}
              <p className="text-xs leading-relaxed font-medium bg-yellow-50 dark:bg-yellow-900/20 px-1 -mx-1 rounded">
                {citation.sentenceHit}
              </p>
              {citation.sentenceAfter && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {citation.sentenceAfter}
                </p>
              )}
            </div>

            {/* Open document link */}
            {citation.documentId > 0 && (
              <a
                href={`/api/documents/${citation.documentId}/download`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                Open document
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
          <HoverCard.Arrow className="fill-border" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
