"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LegalCase } from "@/lib/types";
import {
  LEGAL_CASE_STATUS_COLORS,
} from "@/lib/constants";

interface CaseHeaderProps {
  legalCase: LegalCase | null;
}

export function CaseHeader({ legalCase }: CaseHeaderProps) {
  const t = useTranslations('LegalHub');
  const tStatus = useTranslations("CaseStatuses");
  const tType = useTranslations("CaseTypes");

  if (!legalCase) {
    return null;
  }

  const statusColor =
    LEGAL_CASE_STATUS_COLORS[legalCase.status] ||
    LEGAL_CASE_STATUS_COLORS.new;
  const statusDisplay = tStatus(legalCase.status);
  const typeLabel = tType(legalCase.case_type);

  return (
    <div className="space-y-2">
      <Link
        href="/legal/cases"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('backToCases')}
      </Link>

      <div className="flex items-start justify-between">
        <div className="space-y-1">
          {legalCase.reference_number && (
            <p className="text-sm text-muted-foreground">
              {legalCase.reference_number}
            </p>
          )}
          <h1 className="text-2xl font-bold">{legalCase.title}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {legalCase.court && <span>{legalCase.court}</span>}
            {legalCase.court && legalCase.court_division && (
              <span className="text-muted-foreground/50">|</span>
            )}
            {legalCase.court_division && (
              <span>{legalCase.court_division}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`px-3 py-1 rounded text-sm font-medium ${statusColor}`}
          >
            {statusDisplay}
          </span>
          <span className="px-3 py-1 rounded text-sm font-medium bg-muted text-muted-foreground">
            {typeLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
