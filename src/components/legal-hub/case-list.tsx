"use client";

import { useTranslations } from "next-intl";
import type { LegalCase } from "@/lib/types";
import { CaseCard } from "./case-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CaseListProps {
  cases: LegalCase[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}

/**
 * Compute visible page numbers: up to 5 pages centered around current page.
 */
function getPageNumbers(current: number, totalPages: number): number[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  let start = Math.max(1, current - 2);
  let end = Math.min(totalPages, start + 4);

  // Adjust start if we're near the end
  if (end - start < 4) {
    start = Math.max(1, end - 4);
  }

  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function CaseList({
  cases,
  total,
  page,
  pageSize,
  loading,
  onPageChange,
}: CaseListProps) {
  const t = useTranslations('LegalHub');

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>{t('pagination.noResults')}</p>
      </div>
    );
  }

  const pageNumbers = getPageNumbers(page, totalPages);

  return (
    <div className="space-y-3">
      {cases.map((legalCase) => (
        <CaseCard key={legalCase.id} legalCase={legalCase} />
      ))}

      {/* Pagination controls */}
      <div className="flex items-center justify-between pt-4">
        <span className="text-sm text-muted-foreground">
          {t('pagination.showing', { from, to, total })}
        </span>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label={t('pagination.previous')}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only sm:not-sr-only">{t('pagination.previous')}</span>
          </Button>

          {pageNumbers.map((p) => (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="sm"
              onClick={() => onPageChange(p)}
              aria-label={t('pagination.page', { page: p })}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </Button>
          ))}

          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label={t('pagination.next')}
          >
            <span className="sr-only sm:not-sr-only">{t('pagination.next')}</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
