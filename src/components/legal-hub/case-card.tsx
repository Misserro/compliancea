"use client";

import Link from "next/link";
import { Calendar, User } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import type { LegalCase } from "@/lib/types";
import {
  LEGAL_CASE_STATUS_COLORS,
} from "@/lib/constants";
import type { CasePriority } from "@/lib/types";

const PRIORITY_BADGE_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  low: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
};

interface CaseCardProps {
  legalCase: LegalCase;
}

export function CaseCard({ legalCase }: CaseCardProps) {
  const t = useTranslations('LegalHub');
  const tStatus = useTranslations("CaseStatuses");
  const tType = useTranslations("CaseTypes");
  const locale = useLocale();

  function formatDate(dateString: string | null | undefined) {
    if (!dateString) return null;
    try {
      return new Date(dateString).toLocaleDateString(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  }

  const statusColor =
    LEGAL_CASE_STATUS_COLORS[legalCase.status] ||
    LEGAL_CASE_STATUS_COLORS.new;
  const statusDisplay =
    tStatus(legalCase.status);
  const typeLabel =
    tType(legalCase.case_type);

  return (
    <Link href={`/legal/cases/${legalCase.id}`}>
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
              {legalCase.priority && legalCase.priority !== "normal" && PRIORITY_BADGE_COLORS[legalCase.priority] && (
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${PRIORITY_BADGE_COLORS[legalCase.priority]}`}
                >
                  {t(`priority.${legalCase.priority}` as Parameters<typeof t>[0])}
                </span>
              )}
            </div>

            {/* Court + created date + assignee */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {legalCase.court && <span>{legalCase.court}</span>}
              <span className="text-xs">
                {t('createdOn', { date: formatDate(legalCase.created_at) ?? '' })}
              </span>
              {legalCase.assigned_to_name && (
                <span className="flex items-center gap-1 text-xs">
                  <User className="w-3 h-3" />
                  {legalCase.assigned_to_name}
                </span>
              )}
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
