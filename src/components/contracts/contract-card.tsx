"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import type { Contract, Obligation } from "@/lib/types";
import { STATUS_COLORS, CONTRACT_STATUS_DISPLAY, CATEGORY_MIGRATION_MAP } from "@/lib/constants";
import { ContractMetadataDisplay } from "./contract-metadata-display";
import { ObligationCard } from "../obligations/obligation-card";
import { EvidenceDialog } from "../obligations/evidence-dialog";

interface ContractCardProps {
  contract: Contract;
  obligations?: Obligation[];
  onObligationUpdate?: () => void;
  onContractUpdate?: () => void;
}

// Bidirectional status actions: each status can have forward and/or backward actions
const STATUS_ACTIONS: Record<string, Array<{ label: string; action: string; confirm?: boolean; variant: "forward" | "backward" }>> = {
  unsigned: [
    { label: "→ To Sign", action: "sign", variant: "forward" },
  ],
  signed: [
    { label: "← Inactive", action: "unsign", variant: "backward" },
    { label: "→ Activate", action: "activate", variant: "forward" },
  ],
  active: [
    { label: "← To Sign", action: "deactivate", variant: "backward" },
    { label: "→ Terminate", action: "terminate", confirm: true, variant: "forward" },
  ],
  terminated: [
    { label: "← Reactivate", action: "reactivate", confirm: true, variant: "backward" },
  ],
};

// Category sort order for obligations
const CATEGORY_ORDER: Record<string, number> = {
  payments: 0,
  termination: 1,
  legal: 2,
  others: 3,
};

function getObligationSortKey(ob: Obligation): number {
  const rawCategory = ob.category || "others";
  const category = CATEGORY_MIGRATION_MAP[rawCategory] || rawCategory;
  return CATEGORY_ORDER[category] ?? 99;
}

export function ContractCard({ contract, obligations = [], onObligationUpdate, onContractUpdate }: ContractCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [evidenceDialogObligationId, setEvidenceDialogObligationId] = useState<number | null>(null);

  const statusColor = STATUS_COLORS[contract.status] || STATUS_COLORS.unsigned;
  const statusDisplay = CONTRACT_STATUS_DISPLAY[contract.status] || contract.status;

  // Compute counts for filter buttons
  const activeCount = obligations.filter((ob) => ob.status === "active").length;
  const inactiveCount = obligations.filter((ob) => ob.status === "inactive").length;
  const finalizedCount = obligations.filter((ob) => ob.status === "finalized").length;
  const otherCount = obligations.filter((ob) => !["active", "inactive", "finalized"].includes(ob.status)).length;

  // Filter obligations based on selected filter
  const filteredObligations = obligations.filter((ob) => {
    if (statusFilter === "all") return true;
    return ob.status === statusFilter;
  });

  // Sort by category order, then by due_date
  const sortedObligations = [...filteredObligations].sort((a, b) => {
    const catDiff = getObligationSortKey(a) - getObligationSortKey(b);
    if (catDiff !== 0) return catDiff;
    // Secondary sort: due_date ascending (nulls last)
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return 0;
  });

  const handleStatusAction = async (actionConfig: { label: string; action: string; confirm?: boolean }) => {
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
        toast.success(data.message || `Contract action successful`);
        onObligationUpdate?.();
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

  const actions = STATUS_ACTIONS[contract.status] || [];

  return (
    <div className="bg-card border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      {/* Contract Header */}
      <div
        className="p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <button
              className="mt-1 text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
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
                {actions.map((actionConfig) => (
                  <button
                    key={actionConfig.action}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
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
                    {actionLoading ? "..." : actionConfig.label}
                  </button>
                ))}
              </div>

              <div className="text-sm text-muted-foreground">
                {contract.contracting_vendor || contract.client || "No vendor specified"}
              </div>
            </div>
          </div>

          {/* Obligation Summary Badges */}
          <div className="flex items-center gap-2 ml-4">
            {contract.activeObligations > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-xs font-medium">
                <CheckCircle2 className="w-3 h-3" />
                {contract.activeObligations} Active
              </div>
            )}

            {contract.overdueObligations > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded text-xs font-medium">
                <AlertCircle className="w-3 h-3" />
                {contract.overdueObligations} Overdue
              </div>
            )}

            {contract.finalizedObligations > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 rounded text-xs font-medium">
                <Clock className="w-3 h-3" />
                {contract.finalizedObligations} Finalized
              </div>
            )}
          </div>
        </div>
      </div>

      <EvidenceDialog
        obligationId={evidenceDialogObligationId}
        open={evidenceDialogObligationId !== null}
        onOpenChange={(open) => {
          if (!open) setEvidenceDialogObligationId(null);
        }}
        onEvidenceAdded={() => {
          onObligationUpdate?.();
          setEvidenceDialogObligationId(null);
        }}
      />

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t">
          {/* Contract Metadata */}
          <div className="p-4 bg-muted/30">
            <ContractMetadataDisplay contract={contract} onSave={handleMetadataSave} />
          </div>

          {/* Obligations List */}
          <div className="p-4">
            {/* Status filter buttons */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-sm font-semibold mr-1">Obligations</span>
              <button
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  statusFilter === "active"
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                onClick={() => setStatusFilter("active")}
              >
                Active ({activeCount})
              </button>
              {inactiveCount > 0 && (
                <button
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    statusFilter === "inactive"
                      ? "bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  onClick={() => setStatusFilter("inactive")}
                >
                  Inactive ({inactiveCount})
                </button>
              )}
              {finalizedCount > 0 && (
                <button
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    statusFilter === "finalized"
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  onClick={() => setStatusFilter("finalized")}
                >
                  Finalized ({finalizedCount})
                </button>
              )}
              {otherCount > 0 && (
                <button
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    statusFilter === "all"
                      ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  onClick={() => setStatusFilter("all")}
                >
                  All ({obligations.length})
                </button>
              )}
              {/* Always show "All" if more than one filter has items */}
              {(activeCount > 0 && (inactiveCount > 0 || finalizedCount > 0)) && statusFilter !== "all" && otherCount === 0 && (
                <button
                  className="px-2.5 py-1 rounded text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                  onClick={() => setStatusFilter("all")}
                >
                  All ({obligations.length})
                </button>
              )}
            </div>

            {sortedObligations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No {statusFilter === "all" ? "" : statusFilter + " "}obligations for this contract.
              </p>
            ) : (
              <div className="space-y-3">
                {sortedObligations.map((ob) => (
                  <ObligationCard
                    key={ob.id}
                    obligation={ob}
                    onUpdateField={async (id, field, value) => {
                      try {
                        const res = await fetch(`/api/obligations/${id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ [field]: value }),
                        });
                        if (res.ok) {
                          onObligationUpdate?.();
                        }
                      } catch (err) {
                        console.error("Failed to update obligation:", err);
                      }
                    }}
                    onAddEvidence={(obId) => {
                      setEvidenceDialogObligationId(obId);
                    }}
                    onRemoveEvidence={async (obId, index) => {
                      try {
                        const res = await fetch(`/api/obligations/${obId}/evidence/${index}`, {
                          method: "DELETE",
                        });
                        if (res.ok) {
                          onObligationUpdate?.();
                        }
                      } catch (err) {
                        console.error("Failed to remove evidence:", err);
                      }
                    }}
                    onCheckCompliance={async (id) => {
                      try {
                        const res = await fetch(`/api/obligations/${id}/check-compliance`, {
                          method: "POST",
                        });
                        if (res.ok) {
                          const data = await res.json();
                          console.log("Compliance check:", data);
                        }
                      } catch (err) {
                        console.error("Compliance check failed:", err);
                      }
                    }}
                    onFinalize={async (id, note) => {
                      try {
                        const res = await fetch(`/api/obligations/${id}/finalize`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ note }),
                        });
                        if (res.ok) {
                          toast.success("Obligation finalized");
                          onObligationUpdate?.();
                        } else {
                          const data = await res.json();
                          toast.error(data.error || "Failed to finalize");
                        }
                      } catch (err) {
                        toast.error(`Finalize failed: ${err instanceof Error ? err.message : "Unknown error"}`);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
