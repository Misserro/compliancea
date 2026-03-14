"use client";

import { useState, useRef } from "react";
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import type { Contract, Obligation } from "@/lib/types";
import { STATUS_COLORS, CONTRACT_STATUS_DISPLAY, CATEGORY_MIGRATION_MAP } from "@/lib/constants";
import { ObligationCard } from "../obligations/obligation-card";
import { EvidenceDialog } from "../obligations/evidence-dialog";
import { Skeleton } from "@/components/ui/skeleton";

interface PerContractObligationsProps {
  contracts: Contract[];
  categoryFilter: string;
}

interface ContractRowProps {
  contract: Contract;
  categoryFilter: string;
}

function ContractObligationsRow({ contract, categoryFilter }: ContractRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [evidenceDialogObligationId, setEvidenceDialogObligationId] = useState<number | null>(null);
  const refreshCountRef = useRef(0);

  const statusColor = STATUS_COLORS[contract.status] || STATUS_COLORS.unsigned;
  const statusDisplay = CONTRACT_STATUS_DISPLAY[contract.status] || contract.status;

  const fetchObligations = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${contract.id}/obligations`);
      if (res.ok) {
        const data = await res.json();
        setObligations(data.obligations || []);
        setLoaded(true);
        setFetchError(false);
      } else {
        setFetchError(true);
      }
    } catch (err) {
      console.error("Failed to load obligations:", err);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !loaded) fetchObligations();
  };

  const refreshObligations = async () => {
    const currentRefresh = ++refreshCountRef.current;
    try {
      const res = await fetch(`/api/documents/${contract.id}/obligations`);
      if (res.ok) {
        const data = await res.json();
        // Only apply if this is still the latest refresh
        if (currentRefresh === refreshCountRef.current) {
          setObligations(data.obligations || []);
        }
      }
    } catch (err) {
      console.error("Failed to refresh obligations:", err);
    }
  };

  // Count per status tab (unfiltered by category)
  const activeCount = obligations.filter((ob) => ob.status === "active").length;
  const inactiveCount = obligations.filter((ob) => ob.status === "inactive").length;
  const finalizedCount = obligations.filter((ob) => ob.status === "finalized").length;

  // Apply status filter
  const statusFiltered =
    statusFilter === "all"
      ? obligations
      : obligations.filter((ob) => ob.status === statusFilter);

  // Apply category filter
  const displayed = statusFiltered.filter((ob) => {
    if (categoryFilter === "all") return true;
    const rawCategory = ob.category || "others";
    const cat = CATEGORY_MIGRATION_MAP[rawCategory] || rawCategory;
    return cat === categoryFilter;
  });

  const STATUS_TABS = [
    { key: "active", label: "Active", count: activeCount },
    { key: "inactive", label: "Inactive", count: inactiveCount },
    { key: "finalized", label: "Finalized", count: finalizedCount },
    { key: "all", label: "All", count: obligations.length },
  ];

  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      {/* Row header */}
      <div
        className="p-4 cursor-pointer flex items-center justify-between hover:bg-muted/30 transition-colors"
        onClick={handleExpand}
      >
        <div className="flex items-center gap-3">
          <button className="text-muted-foreground flex-shrink-0">
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          <span className="font-medium text-sm">{contract.name}</span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>
            {statusDisplay}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {contract.activeObligations > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-xs font-medium">
              <CheckCircle2 className="w-3 h-3" />
              {contract.activeObligations} Active
            </div>
          )}
          {contract.overdueObligations > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded text-xs font-medium">
              <AlertCircle className="w-3 h-3" />
              {contract.overdueObligations} Overdue
            </div>
          )}
          {contract.finalizedObligations > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 rounded text-xs font-medium">
              <Clock className="w-3 h-3" />
              {contract.finalizedObligations} Finalized
            </div>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t p-4 space-y-3">
          {loading && !loaded ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded" />
              <Skeleton className="h-16 w-full rounded" />
            </div>
          ) : fetchError ? (
            <p className="text-sm text-destructive py-2">Failed to load obligations. Try collapsing and re-expanding.</p>
          ) : (
            <>
              {/* Status tab filter */}
              <div className="flex items-center gap-2 flex-wrap">
                {STATUS_TABS.map(({ key, label, count }) => (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      statusFilter === key
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {label} ({count})
                  </button>
                ))}
              </div>

              {/* Obligations list */}
              {displayed.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  {categoryFilter !== "all"
                    ? `No ${categoryFilter} obligations for this contract.`
                    : `No ${statusFilter === "all" ? "" : statusFilter + " "}obligations for this contract.`}
                </p>
              ) : (
                <div className="space-y-3">
                  {displayed.map((ob) => (
                    <ObligationCard
                      key={ob.id}
                      obligation={ob}
                      onUpdateField={async (id, field, value) => {
                        try {
                          await fetch(`/api/obligations/${id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ [field]: value }),
                          });
                          refreshObligations();
                        } catch (err) {
                          console.error("Failed to update obligation:", err);
                          toast.error(`Failed to update: ${err instanceof Error ? err.message : "Unknown error"}`);
                        }
                      }}
                      onAddEvidence={(obId) => setEvidenceDialogObligationId(obId)}
                      onRemoveEvidence={async (obId, index) => {
                        try {
                          await fetch(`/api/obligations/${obId}/evidence/${index}`, {
                            method: "DELETE",
                          });
                          refreshObligations();
                        } catch (err) {
                          console.error("Failed to remove evidence:", err);
                        }
                      }}
                      onCheckCompliance={async (id) => {
                        try {
                          await fetch(`/api/obligations/${id}/check-compliance`, {
                            method: "POST",
                          });
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
                            refreshObligations();
                          } else {
                            const data = await res.json();
                            toast.error(data.error || "Failed to finalize");
                          }
                        } catch (err) {
                          toast.error(
                            `Finalize failed: ${err instanceof Error ? err.message : "Unknown error"}`
                          );
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          <EvidenceDialog
            obligationId={evidenceDialogObligationId}
            open={evidenceDialogObligationId !== null}
            onOpenChange={(open) => {
              if (!open) setEvidenceDialogObligationId(null);
            }}
            onEvidenceAdded={() => {
              refreshObligations();
              setEvidenceDialogObligationId(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

export function PerContractObligations({ contracts, categoryFilter }: PerContractObligationsProps) {
  if (contracts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">No contracts found.</p>
    );
  }

  return (
    <div className="space-y-3">
      {contracts.map((contract) => (
        <ContractObligationsRow
          key={contract.id}
          contract={contract}
          categoryFilter={categoryFilter}
        />
      ))}
    </div>
  );
}
