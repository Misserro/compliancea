"use client";

import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS } from "@/lib/constants";
import type { Document } from "@/lib/types";

interface DocumentBadgesProps {
  doc: Document;
  expanded?: boolean;
}

export function DocumentBadges({ doc, expanded = false }: DocumentBadgesProps) {
  const isContract = doc.doc_type === "contract" || doc.doc_type === "agreement";
  const statusLabel = doc.status || "draft";

  return (
    <div className="flex flex-wrap gap-1.5">
      {/* Status Badge - always visible */}
      <Badge
        variant="secondary"
        className={STATUS_COLORS[statusLabel] || STATUS_COLORS.draft}
      >
        {statusLabel.replace("_", " ")}
      </Badge>

      {/* Doc Type Badge - always visible */}
      {doc.doc_type && (
        <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
          {doc.doc_type === "agreement" ? "contract" : doc.doc_type}
        </Badge>
      )}

      {/* In-Force Badge - always visible */}
      {doc.in_force && doc.in_force !== "unknown" && (
        <Badge
          variant="secondary"
          className={
            doc.in_force === "in_force"
              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
          }
        >
          {doc.in_force === "in_force" ? "In Force" : "Archival"}
        </Badge>
      )}

      {/* Sensitivity Badge - always visible */}
      {doc.sensitivity && (
        <Badge
          variant="outline"
          className={
            doc.sensitivity === "restricted"
              ? "border-red-300 text-red-700 dark:border-red-700 dark:text-red-300"
              : doc.sensitivity === "confidential"
              ? "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
              : doc.sensitivity === "internal"
              ? "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300"
              : "border-green-300 text-green-700 dark:border-green-700 dark:text-green-300"
          }
        >
          {doc.sensitivity}
        </Badge>
      )}

      {/* Expanded badges */}
      {expanded && (
        <>
          {/* Source */}
          {doc.gdrive_file_id ? (
            <Badge variant="outline">GDrive</Badge>
          ) : (
            <Badge variant="outline">Local</Badge>
          )}

          {/* Sync Status */}
          {doc.sync_status && (
            <Badge
              variant="secondary"
              className={
                doc.sync_status === "deleted"
                  ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
              }
            >
              {doc.sync_status}
            </Badge>
          )}

          {/* Jurisdiction */}
          {doc.jurisdiction && (
            <Badge variant="outline">{doc.jurisdiction}</Badge>
          )}

          {/* Language */}
          {doc.language && (
            <Badge variant="outline">{doc.language}</Badge>
          )}

          {/* Legal Hold */}
          {doc.legal_hold ? (
            <Badge variant="destructive">Legal Hold</Badge>
          ) : null}

          {/* Auto-tags indicator */}
          {doc.auto_tags && !doc.confirmed_tags && (
            <Badge variant="outline" className="border-dashed">
              Auto-tagged
            </Badge>
          )}
        </>
      )}
    </div>
  );
}
