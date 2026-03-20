"use client";

import { useState } from "react";
import { Plus, MessageSquare } from "lucide-react";
import { ContractList } from "./contract-list";
import { ContractChatPanel } from "./contract-chat-panel";
import { AddContractDialog } from "./add-contract-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CONTRACT_STATUS_DISPLAY } from "@/lib/constants";
import { PERMISSION_LEVELS, type PermissionLevel } from "@/lib/permissions";
import { useSession } from "next-auth/react";

const permLevel = (perms: Record<string, string> | null | undefined, resource: string) =>
  PERMISSION_LEVELS[(perms?.[resource] ?? 'full') as PermissionLevel] ?? 3;

export function ContractsTab() {
  const { data: sessionData } = useSession();
  const canEdit = permLevel(sessionData?.user?.permissions, 'contracts') >= 2;
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
    Object.keys(CONTRACT_STATUS_DISPLAY)
  );
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [selectedContractName, setSelectedContractName] = useState<string | null>(null);

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  function handleContractSelect(
    contractId: number | null,
    contractName: string | null
  ) {
    setSelectedContractId(contractId);
    setSelectedContractName(contractName);
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">All Contracts</h3>
        <div className="flex items-center gap-2">
          <Button
            variant={chatOpen ? "default" : "outline"}
            size="sm"
            onClick={() => setChatOpen((v) => !v)}
            className="gap-1.5"
          >
            <MessageSquare className="h-4 w-4" />
            {chatOpen ? "Close Chat" : "Ask AI"}
          </Button>
          {canEdit && (
            <button
              className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="w-4 h-4" />
              Add New Contract
            </button>
          )}
        </div>
      </div>

      {/* Main layout: list (always visible) + optional chat panel */}
      <div className={chatOpen ? "grid grid-cols-2 gap-4 items-start" : undefined}>
        {/* Left column: search, filters, list */}
        <div className="space-y-4">
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
            selectedContractId={chatOpen ? selectedContractId : undefined}
            onSelectContract={chatOpen ? handleContractSelect : undefined}
          />
        </div>

        {/* Right column: chat panel — only rendered when chatOpen */}
        {chatOpen && (
          <div className="sticky top-6">
            <ContractChatPanel
              selectedContractId={selectedContractId}
              selectedContractName={selectedContractName}
              onClose={() => {
                setChatOpen(false);
                setSelectedContractId(null);
                setSelectedContractName(null);
              }}
            />
          </div>
        )}
      </div>

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
