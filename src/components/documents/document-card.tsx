"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Play, Briefcase, Trash2, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DocumentBadges } from "./document-badges";
import { DEPARTMENTS } from "@/lib/constants";
import type { Document } from "@/lib/types";

interface DocumentCardProps {
  doc: Document;
  expanded: boolean;
  onCategoryChange: (id: number, category: string | null) => void;
  onProcess: (id: number) => void;
  onDelete: (id: number) => void;
  onEditMetadata: (doc: Document) => void;
  onManageContract: (docId: number) => void;
  processing?: boolean;
}

export function DocumentCard({
  doc,
  expanded,
  onCategoryChange,
  onProcess,
  onDelete,
  onEditMetadata,
  onManageContract,
  processing = false,
}: DocumentCardProps) {
  const [isOpen, setIsOpen] = useState(expanded);
  const isContract = doc.doc_type === "contract" || doc.doc_type === "agreement";

  // Sync expanded prop
  if (expanded !== isOpen && expanded) {
    setIsOpen(true);
  }

  return (
    <Card className="border-l-4 border-l-transparent hover:border-l-primary/50 transition-colors">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardContent className="py-3 px-4">
          <div className="flex items-start gap-3">
            {/* Expand toggle */}
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 mt-0.5">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-medium text-sm truncate">{doc.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {doc.processed
                    ? `${doc.word_count?.toLocaleString() || 0} words`
                    : "Not processed"}
                </span>
              </div>

              <DocumentBadges doc={doc} expanded={isOpen} />

              {/* Expanded content */}
              <CollapsibleContent>
                <div className="mt-3 pt-3 border-t space-y-2">
                  {/* Category selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">Category:</span>
                    <Select
                      value={doc.category || "none"}
                      onValueChange={(val) =>
                        onCategoryChange(doc.id, val === "none" ? null : val)
                      }
                    >
                      <SelectTrigger className="h-7 text-xs w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {DEPARTMENTS.map((dept) => (
                          <SelectItem key={dept} value={dept}>
                            {dept}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Tags */}
                  {doc.tags && (() => {
                    try {
                      const tags = JSON.parse(doc.tags);
                      if (Array.isArray(tags) && tags.length > 0) {
                        return (
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-muted-foreground w-16 shrink-0">Tags:</span>
                            <p className="text-xs text-muted-foreground">
                              {tags.join(", ")}
                            </p>
                          </div>
                        );
                      }
                    } catch { /* ignore */ }
                    return null;
                  })()}

                  {/* Client */}
                  {doc.client && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-16">Client:</span>
                      <span className="text-xs">{doc.client}</span>
                    </div>
                  )}

                  {/* Added date */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">Added:</span>
                    <span className="text-xs">
                      {new Date(doc.added_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </CollapsibleContent>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onEditMetadata(doc)}
                title="Edit metadata"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>

              {doc.processed ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => window.open(`/api/documents/${doc.id}/download`, "_blank")}
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onProcess(doc.id)}
                  disabled={processing}
                  title="Process document"
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
              )}

              {isContract && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onManageContract(doc.id)}
                  title="Manage contract"
                >
                  <Briefcase className="h-3.5 w-3.5" />
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm(`Delete "${doc.name}"?`)) {
                    onDelete(doc.id);
                  }
                }}
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Collapsible>
    </Card>
  );
}
