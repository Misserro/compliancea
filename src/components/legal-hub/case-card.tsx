"use client";

import Link from "next/link";
import { Calendar } from "lucide-react";
import type { LegalCase } from "@/lib/types";
import {
  LEGAL_CASE_STATUS_COLORS,
  LEGAL_CASE_STATUS_DISPLAY,
  LEGAL_CASE_TYPE_LABELS,
} from "@/lib/constants";

interface CaseCardProps {
  legalCase: LegalCase;
}

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return null;
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

export function CaseCard({ legalCase }: CaseCardProps) {
  const statusColor =
    LEGAL_CASE_STATUS_COLORS[legalCase.status] ||
    LEGAL_CASE_STATUS_COLORS.new;
  const statusDisplay =
    LEGAL_CASE_STATUS_DISPLAY[legalCase.status] || legalCase.status;
  const typeLabel =
    LEGAL_CASE_TYPE_LABELS[legalCase.case_type] || legalCase.case_type;

  return (
    <Link href={`/legal-hub/${legalCase.id}`}>
      <div className="bg-card border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {/* Reference number */}
            {legalCase.reference_number && (
              <p className="text-xs text-muted-foreground mb-0.5">
                {legalCase.reference_number}
              </p>
            )}

            {/* Title + status badge */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="font-semibold text-base truncate">
                {legalCase.title}
              </h3>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${statusColor}`}
              >
                {statusDisplay}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground whitespace-nowrap">
                {typeLabel}
              </span>
            </div>

            {/* Court + created date */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {legalCase.court && <span>{legalCase.court}</span>}
              <span className="text-xs">
                Created {formatDate(legalCase.created_at)}
              </span>
            </div>
          </div>

          {/* Next deadline */}
          {legalCase.next_deadline && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground ml-4 shrink-0">
              <Calendar className="w-3.5 h-3.5" />
              <span className="text-xs">
                {formatDate(legalCase.next_deadline)}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
