"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ContractList } from "./contract-list";
import { AddContractDialog } from "./add-contract-dialog";
import { Input } from "@/components/ui/input";
import { CONTRACT_STATUS_DISPLAY } from "@/lib/constants";

export function ContractsTab() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
    Object.keys(CONTRACT_STATUS_DISPLAY)
  );

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
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

      {/* Search + filter row */}
      <div className="space-y-2">
        <Input
          placeholder="Search by name or vendor…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(CONTRACT_STATUS_DISPLAY).map(([key, label]) => (
            <label key={key} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selectedStatuses.includes(key)}
                onChange={() => toggleStatus(key)}
                className="rounded border-input"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <ContractList
        refreshTrigger={refreshTrigger}
        searchQuery={searchQuery}
        selectedStatuses={selectedStatuses}
      />

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
