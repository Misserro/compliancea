"use client";

import type { LegalCase, CaseParty, CaseDeadline } from "@/lib/types";
import { CaseMetadataForm } from "./case-metadata-form";
import { CasePartiesSection } from "./case-parties-section";
import { CaseStatusSection } from "./case-status-section";
import { CaseDeadlinesSection } from "./case-deadlines-section";

interface CaseOverviewTabProps {
  legalCase: LegalCase;
  parties: CaseParty[];
  deadlines: CaseDeadline[];
  caseId: number;
  onRefresh: () => void;
}

export function CaseOverviewTab({
  legalCase,
  parties,
  deadlines,
  caseId,
  onRefresh,
}: CaseOverviewTabProps) {
  return (
    <div className="space-y-8">
      <CaseMetadataForm legalCase={legalCase} caseId={caseId} onSaved={onRefresh} />
      <CasePartiesSection parties={parties} caseId={caseId} onRefresh={onRefresh} />
      <CaseStatusSection legalCase={legalCase} caseId={caseId} onRefresh={onRefresh} />
      <CaseDeadlinesSection deadlines={deadlines} caseId={caseId} onRefresh={onRefresh} />
    </div>
  );
}
