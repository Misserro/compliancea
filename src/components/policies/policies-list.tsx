"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Download, GitBranch, GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PendingReplacementBanner } from "./pending-replacement-banner";
import { VersionHistoryPanel } from "./version-history-panel";
import { SetReplacementModal } from "./set-replacement-modal";
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

interface PoliciesListProps {
  documents: Document[];
  pendingReplacements: PendingReplacement[];
  onRefresh: () => void;
}

function PolicyRow({
  doc,
  pending,
  onRefresh,
}: {
  doc: Document;
  pending: PendingReplacement | undefined;
  onRefresh: () => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);

  const isActive = isInForce(doc.in_force);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
        {/* Expand history */}
        <button
          onClick={() => setHistoryOpen((v) => !v)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {historyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {/* Name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{doc.name}</span>
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              v{doc.version ?? 1}
            </Badge>
            <Badge
              className={`text-xs px-1.5 py-0 ${
                isActive
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
              }`}
            >
              {isActive ? "Active" : "Archived"}
            </Badge>
            {doc.category && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                {doc.category}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(doc.added_at).toLocaleDateString()}
          </p>
        </div>

        {/* Actions */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => window.open(`/api/documents/${doc.id}/download?download=true`, '_blank')}
          title="Download document"
        >
          <Download className="h-3.5 w-3.5 mr-1" />
          Download
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setReplaceModalOpen(true)}
          title="Set as replacement for another document"
        >
          <GitMerge className="h-3.5 w-3.5 mr-1" />
          Replace
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setHistoryOpen((v) => !v)}
        >
          <GitBranch className="h-3.5 w-3.5 mr-1" />
          History
        </Button>
      </div>

      {/* Pending replacement banner */}
      {pending && (
        <div className="px-4 pb-2">
          <PendingReplacementBanner
            documentId={doc.id}
            candidateName={pending.candidate_name}
            candidateVersion={pending.candidate_version}
            confidence={pending.confidence}
            onResolved={onRefresh}
          />
        </div>
      )}

      {/* Version history */}
      {historyOpen && (
        <div className="border-t bg-muted/10">
          <VersionHistoryPanel documentId={doc.id} documentName={doc.name} />
        </div>
      )}

      <SetReplacementModal
        document={doc}
        open={replaceModalOpen}
        onOpenChange={setReplaceModalOpen}
        onResolved={onRefresh}
      />
    </div>
  );
}

export function PoliciesList({ documents, pendingReplacements, onRefresh }: PoliciesListProps) {
  const pendingMap = new Map(pendingReplacements.map((p) => [p.new_document_id, p]));

  if (documents.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No policy documents found.</p>
        <p className="text-sm mt-1">Upload a policy or procedure, or adjust the document types in Settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <PolicyRow
          key={doc.id}
          doc={doc}
          pending={pendingMap.get(doc.id)}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}
