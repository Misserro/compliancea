"use client";

import { UpcomingObligationsSection } from "@/components/contracts/upcoming-obligations-section";
import { ContractList } from "@/components/contracts/contract-list";

export default function ContractsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Contract Hub</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage contracts and track their obligations.
        </p>
      </div>

      {/* Upcoming Obligations Section */}
      <UpcomingObligationsSection />

      {/* Contracts List */}
      <div>
        <h3 className="text-lg font-semibold mb-4">All Contracts</h3>
        <ContractList />
      </div>
    </div>
  );
}
