"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { ContractList } from "./contract-list";
import { ContractChatPanel } from "./contract-chat-panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CONTRACT_STATUSES } from "@/lib/constants";
export function ContractsTab() {
  const t = useTranslations("Contracts");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
    [...CONTRACT_STATUSES]
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
        <h3 className="text-lg font-semibold">{t("allContracts")}</h3>
        <div className="flex items-center gap-2">
          <Button
            variant={chatOpen ? "default" : "outline"}
            size="sm"
            onClick={() => setChatOpen((v) => !v)}
            className="gap-1.5"
          >
            <MessageSquare className="h-4 w-4" />
            {chatOpen ? t("closeChat") : t("askAI")}
          </Button>
        </div>
      </div>

      {/* Main layout: list (always visible) + optional chat panel */}
      <div className={chatOpen ? "grid grid-cols-2 gap-4 items-start" : undefined}>
        {/* Left column: search, filters, list */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Input
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {CONTRACT_STATUSES.map((key) => (
                <label key={key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedStatuses.includes(key)}
                    onChange={() => toggleStatus(key)}
                    className="rounded border-input"
                  />
                  {t(`contractStatus.${key}`)}
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

    </div>
  );
}
