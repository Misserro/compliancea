"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ContractList } from "./contract-list";
import { AddContractDialog } from "./add-contract-dialog";

export function ContractsTab() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">All Contracts</h3>
        <button
          className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors"
          onClick={() => setShowAddDialog(true)}
        >
          <Plus className="w-4 h-4" />
          Add New Contract
        </button>
      </div>

      <ContractList refreshTrigger={refreshTrigger} />

      <AddContractDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={() => {
          setShowAddDialog(false);
          setRefreshTrigger((t) => t + 1);
        }}
      />
    </div>
  );
}
