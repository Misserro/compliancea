"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CATEGORY_COLORS,
  CATEGORY_BORDER_COLORS,
  STATUS_COLORS,
  OBLIGATION_STATUSES,
} from "@/lib/constants";
import type { Obligation, Evidence } from "@/lib/types";

interface ObligationCardProps {
  obligation: Obligation;
  onUpdateField: (id: number, field: string, value: string) => void;
  onAddEvidence: (id: number) => void;
  onRemoveEvidence: (id: number, index: number) => void;
  onCheckCompliance: (id: number) => void;
}

export function ObligationCard({
  obligation: ob,
  onUpdateField,
  onAddEvidence,
  onRemoveEvidence,
  onCheckCompliance,
}: ObligationCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  const category = ob.category || "other";
  const borderColor = CATEGORY_BORDER_COLORS[category] || CATEGORY_BORDER_COLORS.other;
  const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;

  // Parse details
  let dueDates: Array<{ label?: string; date?: string; amount?: string; details?: string }> = [];
  let keyValues: { amounts?: string[]; deadlines?: string[]; conditions?: string[] } = {};
  try {
    const details = ob.details_json ? JSON.parse(ob.details_json) : {};
    dueDates = details.due_dates || [];
    keyValues = details.key_values || {};
  } catch { /* ignore */ }

  // Parse evidence
  let evidence: Evidence[] = [];
  try {
    evidence = JSON.parse(ob.evidence_json || "[]");
  } catch { /* ignore */ }

  // Due date formatting
  const isOverdue = ob.due_date && new Date(ob.due_date) < new Date() && ob.status === "active";
  const isUpcoming = ob.due_date && !isOverdue &&
    (new Date(ob.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24) <= 30;

  // Compact info line
  const compactParts: string[] = [];
  if (keyValues.amounts && keyValues.amounts.length > 0) {
    compactParts.push(keyValues.amounts[0]);
  }
  if (keyValues.deadlines && keyValues.deadlines.length > 0) {
    compactParts.push(keyValues.deadlines[0]);
  }
  if (ob.due_date) {
    compactParts.push(`Due: ${new Date(ob.due_date).toLocaleDateString()}`);
  }

  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardContent className="py-3 px-4">
          {/* Header */}
          <div className="flex items-start gap-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 mt-0.5">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className={`text-xs ${categoryColor}`}>
                  {category}
                </Badge>
                <span className="text-sm font-medium">{ob.title}</span>
                <Badge
                  variant="secondary"
                  className={`text-xs ${
                    isOverdue
                      ? STATUS_COLORS.overdue
                      : STATUS_COLORS[ob.status] || STATUS_COLORS.active
                  }`}
                >
                  {isOverdue ? "Overdue" : ob.status}
                </Badge>
              </div>

              {/* Compact info */}
              {compactParts.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {compactParts.join(" · ")}
                </p>
              )}
            </div>
          </div>

          {/* Expanded content */}
          <CollapsibleContent>
            <div className="mt-4 pt-3 border-t space-y-4 ml-8">
              {/* Summary */}
              {ob.summary && (
                <p className="text-sm text-muted-foreground">{ob.summary}</p>
              )}

              {/* Payment schedule */}
              {dueDates.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">
                    Schedule
                  </h4>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted">
                          <th className="text-left px-3 py-1.5 font-medium">Item</th>
                          <th className="text-left px-3 py-1.5 font-medium">Date</th>
                          <th className="text-left px-3 py-1.5 font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dueDates.slice(0, 8).map((dd, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-1.5">{dd.label || ob.title}</td>
                            <td className={`px-3 py-1.5 ${
                              dd.date && new Date(dd.date) < new Date()
                                ? "text-destructive font-medium"
                                : ""
                            }`}>
                              {dd.date ? new Date(dd.date).toLocaleDateString() : "—"}
                            </td>
                            <td className="px-3 py-1.5">{dd.amount || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {dueDates.length > 8 && (
                      <p className="text-xs text-muted-foreground px-3 py-1.5 bg-muted">
                        +{dueDates.length - 8} more items
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Penalties */}
              {ob.penalties && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1">
                    Penalties
                  </h4>
                  <p className="text-sm text-destructive">{ob.penalties}</p>
                </div>
              )}

              {/* Owner & Escalation */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Owner</label>
                  <Input
                    value={ob.owner || ""}
                    onChange={(e) => onUpdateField(ob.id, "owner", e.target.value)}
                    placeholder="Assign owner..."
                    className="h-7 text-xs mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Escalation To</label>
                  <Input
                    value={ob.escalation_to || ""}
                    onChange={(e) => onUpdateField(ob.id, "escalation_to", e.target.value)}
                    placeholder="Escalation..."
                    className="h-7 text-xs mt-1"
                  />
                </div>
              </div>

              {/* Proof description */}
              {ob.proof_description && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1">
                    Required Proof
                  </h4>
                  <p className="text-xs bg-muted p-2 rounded">{ob.proof_description}</p>
                </div>
              )}

              {/* Evidence */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-medium text-muted-foreground">
                    Evidence ({evidence.length})
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => onAddEvidence(ob.id)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
                {evidence.length > 0 ? (
                  <div className="space-y-1">
                    {evidence.map((ev, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs bg-muted px-2 py-1.5 rounded"
                      >
                        <span>{ev.documentName}</span>
                        <div className="flex items-center gap-1">
                          {ev.note && (
                            <span className="text-muted-foreground">{ev.note}</span>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-destructive"
                            onClick={() => {
                              if (confirm("Remove this evidence?")) {
                                onRemoveEvidence(ob.id, idx);
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No evidence attached.</p>
                )}
              </div>

              {/* Compliance check & Status */}
              <div className="flex items-center justify-between pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={checking || evidence.length === 0}
                  onClick={async () => {
                    setChecking(true);
                    try {
                      await onCheckCompliance(ob.id);
                    } finally {
                      setChecking(false);
                    }
                  }}
                >
                  <ShieldCheck className="h-4 w-4 mr-1" />
                  {checking ? "Checking..." : "Check Compliance"}
                </Button>

                <Select
                  value={ob.status}
                  onValueChange={(val) => onUpdateField(ob.id, "status", val)}
                >
                  <SelectTrigger className="h-7 text-xs w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OBLIGATION_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}
