"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { toast } from "sonner";
import type { Contract } from "@/lib/types";
import { STATUS_COLORS, CONTRACT_STATUS_DISPLAY } from "@/lib/constants";
import { ContractMetadataDisplay } from "./contract-metadata-display";

interface ContractCardProps {
  contract: Contract;
  onContractUpdate?: () => void;
}

type StatusActionConfig = {
  label: string;
  action: string;
  confirm?: boolean;
  variant: "forward" | "backward";
};

const STATUS_ACTIONS: Record<string, Array<StatusActionConfig>> = {
  unsigned: [{ label: "→ To Sign", action: "sign", variant: "forward" }],
  signed: [
    { label: "← Inactive", action: "unsign", variant: "backward" },
    { label: "→ Activate", action: "activate", variant: "forward" },
  ],
  active: [
    { label: "← To Sign", action: "deactivate", variant: "backward" },
    { label: "→ Terminate", action: "terminate", confirm: true, variant: "forward" },
  ],
  terminated: [{ label: "← Reactivate", action: "reactivate", confirm: true, variant: "backward" }],
};

const STATUS_ORDER = ["unsigned", "signed", "active", "terminated"] as const;

function formatDate(dateString: string | null) {
  if (!dateString) return null;
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

export function ContractCard({ contract, onContractUpdate }: ContractCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const statusColor = STATUS_COLORS[contract.status] || STATUS_COLORS.unsigned;
  const statusDisplay = CONTRACT_STATUS_DISPLAY[contract.status] || contract.status;
  const actions = STATUS_ACTIONS[contract.status] || [];

  const handleStatusAction = async (actionConfig: StatusActionConfig) => {
    if (actionConfig.confirm) {
      const confirmed = window.confirm(
        actionConfig.action === "terminate"
          ? "Are you sure you want to terminate this contract? This will create a termination notice obligation with a 30-day deadline."
          : `Are you sure you want to ${actionConfig.label.replace(/[←→]\s*/, "")} this contract?`
      );
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
        toast.success(data.message || "Contract action successful");
        onContractUpdate?.();
      } else {
        toast.error(data.error || "Action failed");
      }
    } catch (err) {
      toast.error(`Action failed: ${err instanceof Error ? err.message : "Unknown error"}`);
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
        toast.success("Contract info updated");
        onContractUpdate?.();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update contract info");
      }
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  return (
    <div className="bg-card border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      {/* Collapsed header */}
      <div
        className="p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <button
              className="mt-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </button>

            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-semibold text-base">{contract.name}</h3>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>
                  {statusDisplay}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {contract.contracting_vendor || contract.client || "No vendor specified"}
                {contract.expiry_date && (
                  <span className="ml-2 text-xs">
                    · Expires {formatDate(contract.expiry_date)}
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
                <div className="text-xs font-medium text-muted-foreground mb-1.5">Document</div>
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
            </div>

            {/* Right column: status strip + action buttons */}
            <div className="space-y-5">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">Contract Status</div>
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
                        {CONTRACT_STATUS_DISPLAY[s]}
                      </span>
                      {i < STATUS_ORDER.length - 1 && (
                        <span className="text-muted-foreground text-xs">→</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {actions.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Actions</div>
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
                        {actionLoading ? "…" : actionConfig.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
