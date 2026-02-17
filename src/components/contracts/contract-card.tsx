"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import type { Contract, Obligation } from "@/lib/types";
import { STATUS_COLORS, CONTRACT_STATUS_DISPLAY } from "@/lib/constants";
import { ContractMetadataDisplay } from "./contract-metadata-display";
import { ObligationCard } from "../obligations/obligation-card";

interface ContractCardProps {
  contract: Contract;
  obligations?: Obligation[];
  onObligationUpdate?: () => void;
}

export function ContractCard({ contract, obligations = [], onObligationUpdate }: ContractCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statusColor = STATUS_COLORS[contract.status] || STATUS_COLORS.unsigned;
  const statusDisplay = CONTRACT_STATUS_DISPLAY[contract.status] || contract.status;

  // Filter to show only active obligations
  const activeObligations = obligations.filter((ob) => ob.status === "active");

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
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-base">{contract.name}</h3>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>
                  {statusDisplay}
                </span>
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

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t">
          {/* Contract Metadata */}
          <div className="p-4 bg-muted/30">
            <ContractMetadataDisplay contract={contract} />
          </div>

          {/* Obligations List */}
          <div className="p-4">
            <h4 className="text-sm font-semibold mb-3">
              Active Obligations ({activeObligations.length})
            </h4>

            {activeObligations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active obligations for this contract.</p>
            ) : (
              <div className="space-y-3">
                {activeObligations.map((ob) => (
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
                        if (res.ok && onObligationUpdate) {
                          onObligationUpdate();
                        }
                      } catch (err) {
                        console.error("Failed to update obligation:", err);
                      }
                    }}
                    onAddEvidence={() => {
                      // TODO: Open evidence dialog
                    }}
                    onRemoveEvidence={async (obId, index) => {
                      try {
                        const res = await fetch(`/api/obligations/${obId}/evidence/${index}`, {
                          method: "DELETE",
                        });
                        if (res.ok && onObligationUpdate) {
                          onObligationUpdate();
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
