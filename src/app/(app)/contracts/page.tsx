"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ContractsTab } from "@/components/contracts/contracts-tab";
import { ObligationsTab } from "@/components/contracts/obligations-tab";

function ContractsPageContent() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") === "obligations" ? "obligations" : "contracts";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Tab bar */}
      <div className="flex gap-0 border-b">
        <Link
          href="/contracts?tab=contracts"
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "contracts"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Contracts
        </Link>
        <Link
          href="/contracts?tab=obligations"
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "obligations"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Obligations
        </Link>
      </div>

      {activeTab === "contracts" ? <ContractsTab /> : <ObligationsTab />}
    </div>
  );
}

export default function ContractsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <ContractsPageContent />
    </Suspense>
  );
}
