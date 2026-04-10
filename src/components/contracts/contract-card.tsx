"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";
import type { Contract } from "@/lib/types";
import { STATUS_COLORS, CONTRACT_TYPES } from "@/lib/constants";
import { Checkbox } from "@/components/ui/checkbox";
import { ContractMetadataDisplay } from "./contract-metadata-display";
import { InvoiceSection } from "./invoice-section";
import { ContractDocumentsSection } from "./contract-documents-section";
import { ContractAnnexesSection } from "./contract-annexes-section";
import { ContractGDriveInvoicesSection } from "./contract-gdrive-invoices-section";

interface ContractCardProps {
  contract: Contract;
  onContractUpdate?: () => void;
  onSelect?: (contractId: number | null, contractName: string | null) => void;
  isSelected?: boolean;
  isMultiSelected?: boolean;
  onToggleSelect?: (contractId: number) => void;
}

type StatusActionConfig = {
  labelKey: string;
  action: string;
  confirm?: boolean;
  variant: "forward" | "backward";
};

const STATUS_ACTIONS: Record<string, Array<StatusActionConfig>> = {
  unsigned: [{ labelKey: "statusAction.toSign", action: "sign", variant: "forward" }],
  signed: [
    { labelKey: "statusAction.inactive", action: "unsign", variant: "backward" },
    { labelKey: "statusAction.activate", action: "activate", variant: "forward" },
  ],
  active: [
    { labelKey: "statusAction.deactivate", action: "deactivate", variant: "backward" },
    { labelKey: "statusAction.terminate", action: "terminate", confirm: true, variant: "forward" },
  ],
  terminated: [{ labelKey: "statusAction.reactivate", action: "reactivate", confirm: true, variant: "backward" }],
};

const STATUS_ORDER = ["unsigned", "signed", "active", "terminated"] as const;

export function ContractCard({ contract, onContractUpdate, onSelect, isSelected, isMultiSelected, onToggleSelect }: ContractCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const t = useTranslations("Contracts");
  const locale = useLocale();

  const formatDate = (dateString: string | null) => {
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
  };

  const statusColor = STATUS_COLORS[contract.status] || STATUS_COLORS.unsigned;
  const statusDisplay = t(`contractStatus.${contract.status}`);
  const actions = STATUS_ACTIONS[contract.status] || [];

  const handleStatusAction = async (actionConfig: StatusActionConfig) => {
    if (actionConfig.confirm) {
      const confirmMessage =
        actionConfig.action === "terminate"
          ? t("confirmTerminate")
          : t("confirmAction", { action: t(actionConfig.labelKey).replace(/[←→]\s*/, "") });
      const confirmed = window.confirm(confirmMessage);
      if (!confirmed) return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/documents/${contract.id}/contract-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionConfig.action }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || t("actionSuccess"));
        onContractUpdate?.();
      } else {
        toast.error(data.error || t("actionFailed"));
      }
    } catch (err) {
      toast.error(`${t("actionFailed")}: ${err instanceof Error ? err.message : ""}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMetadataSave = async (metadata: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/contracts/${contract.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata),
      });
      if (res.ok) {
        toast.success(t("infoUpdated"));
        onContractUpdate?.();
      } else {
        const data = await res.json();
        toast.error(data.error || t("updateFailed"));
      }
    } catch (err) {
      toast.error(`${t("saveFailed")}: ${err instanceof Error ? err.message : ""}`);
    }
  };

  return (
    <div className={`bg-card border rounded-lg overflow-hidden hover:shadow-md transition-shadow ${isSelected || isMultiSelected ? "ring-2 ring-primary/40" : ""}`}>
      {/* Collapsed header */}
      <div
        className="p-4 cursor-pointer"
        onClick={() => {
          const nextExpanded = !expanded;
          setExpanded(nextExpanded);
          if (onSelect) {
            onSelect(nextExpanded ? contract.id : null, nextExpanded ? contract.name : null);
          }
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {onToggleSelect && (
              <div
                className="mt-1.5 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <Checkbox
                  checked={!!isMultiSelected}
                  onCheckedChange={() => onToggleSelect(contract.id)}
                />
              </div>
            )}
            <button
              className="mt-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 min-w-0">
                <h3 className="font-semibold text-base truncate">{contract.name}</h3>
                <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${statusColor}`}>
                  {statusDisplay}
                </span>
                {contract.contract_type && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground whitespace-nowrap">
                    {CONTRACT_TYPES.find(ct => ct.value === contract.contract_type)?.label ?? contract.contract_type}
                  </span>
                )}
                {!!contract.is_historical && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
                    {t('historical')}
                  </span>
                )}
              </div>
              <div className="text-sm text-muted-foreground truncate">
                {contract.contracting_vendor || contract.client || t("noVendor")}
                {contract.expiry_date && (
                  <span className="ml-2 text-xs">
                    · {t("expires", { date: formatDate(contract.expiry_date) ?? "" })}
                  </span>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Expanded two-column content */}
      {expanded && (
        <div className="border-t">
          <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-muted/30">
            {/* Left column: metadata + document download */}
            <div className="space-y-4">
              <ContractMetadataDisplay contract={contract} onSave={handleMetadataSave} />
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">{t("documentLabel")}</div>
                <a
                  href={`/api/documents/${contract.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="w-3.5 h-3.5" />
                  {contract.name}
                </a>
              </div>
              <ContractAnnexesSection contractId={contract.id} />
              <ContractGDriveInvoicesSection contractId={contract.id} />
            </div>

            {/* Right column: status strip + action buttons */}
            <div className="space-y-5">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">{t("contractStatusLabel")}</div>
                <div className="flex items-center gap-1 flex-wrap">
                  {STATUS_ORDER.map((s, i) => (
                    <div key={s} className="flex items-center gap-1">
                      <span
                        className={`px-2.5 py-1 rounded text-xs font-medium ${
                          s === contract.status
                            ? STATUS_COLORS[s]
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {t(`contractStatus.${s}`)}
                      </span>
                      {i < STATUS_ORDER.length - 1 && (
                        <span className="text-muted-foreground text-xs">{"\u2192"}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {actions.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">{t("actionsLabel")}</div>
                  <div className="flex flex-wrap gap-2">
                    {actions.map((actionConfig) => (
                      <button
                        key={actionConfig.action}
                        className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                          actionConfig.variant === "backward"
                            ? "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                            : actionConfig.confirm
                            ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800"
                            : "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800"
                        }`}
                        disabled={actionLoading}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStatusAction(actionConfig);
                        }}
                      >
                        {actionLoading ? "\u2026" : t(actionConfig.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Invoice section — spans full width below the two-column grid */}
          <div className="p-4 md:p-6 pt-0 md:pt-0 bg-muted/30">
            <div className="border-t pt-4">
              <InvoiceSection contractId={contract.id} onUpdate={onContractUpdate} />
            </div>
          </div>

          {/* Documents section — spans full width below invoices */}
          <div className="p-4 md:p-6 pt-0 md:pt-0 bg-muted/30">
            <div className="border-t pt-4">
              <ContractDocumentsSection contractId={contract.id} onUpdate={onContractUpdate} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
