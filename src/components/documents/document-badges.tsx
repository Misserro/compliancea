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
      {/* In-Force Pill - always visible */}
      {doc.in_force && doc.in_force !== "unknown" && (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            doc.in_force === "in_force" || doc.in_force === "true"
              ? "bg-green-500 text-white"
              : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
          {doc.in_force === "in_force" || doc.in_force === "true" ? "In Force" : "Archived"}
        </span>
      )}

      {/* Expanded badges */}
      {expanded && (
        <>
          {/* Status Badge */}
          <Badge
            variant="secondary"
            className={STATUS_COLORS[statusLabel] || STATUS_COLORS.draft}
          >
            {statusLabel.replace("_", " ")}
          </Badge>

          {/* Doc Type Badge */}
          {doc.doc_type && (
            <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
              {doc.doc_type === "agreement" ? "contract" : doc.doc_type}
            </Badge>
          )}

          {/* Sensitivity Badge */}
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
