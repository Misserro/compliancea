"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Paperclip, Trash2, ShieldCheck, CheckCircle, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CATEGORY_COLORS,
  CATEGORY_BORDER_COLORS,
  CATEGORY_MIGRATION_MAP,
  STATUS_COLORS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { CompleteObligationDialog } from "./complete-obligation-dialog";
import type { Obligation, Evidence } from "@/lib/types";

interface ObligationCardProps {
  obligation: Obligation;
  onUpdateField: (id: number, field: string, value: string) => void;
  onAddEvidence: (id: number) => void;
  onRemoveEvidence: (id: number, index: number) => void;
  onCheckCompliance: (id: number) => void;
  onCompleted?: () => void;
}

export function ObligationCard({
  obligation: ob,
  onUpdateField,
  onAddEvidence,
  onRemoveEvidence,
  onCheckCompliance,
  onCompleted,
}: ObligationCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [deletingEvidenceIndex, setDeletingEvidenceIndex] = useState<number | null>(null);

  // Apply category migration for legacy data
  const rawCategory = ob.category || "others";
  const category = CATEGORY_MIGRATION_MAP[rawCategory] || rawCategory;
  const borderColor = CATEGORY_BORDER_COLORS[category] || CATEGORY_BORDER_COLORS.others;
  const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.others;

  // Parse evidence
  let evidence: Evidence[] = [];
  try {
    evidence = JSON.parse(ob.evidence_json || "[]");
  } catch { /* ignore */ }

  // Due date logic
  const isCompleted = ob.status === "met" || ob.status === "finalized";
  const now = new Date();
  const dueDate = ob.due_date ? new Date(ob.due_date) : null;
  const isOverdue = dueDate && dueDate < now && !isCompleted;
  const daysUntilDue = dueDate ? (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24) : null;
  const isUpcoming = dueDate && !isOverdue && !isCompleted && daysUntilDue !== null && daysUntilDue <= 7;

  // Category-specific fields
  const categoryFields = getCategoryFields(ob, category);

  return (
    <>
      <Card className={cn("border-l-4", borderColor)}>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CardContent className="py-3 px-4">
            {/* Surface row */}
            <div className="flex items-center gap-2">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>

              <Badge variant="secondary" className={cn("text-xs shrink-0", categoryColor)}>
                {category}
              </Badge>

              <span className="text-sm font-medium truncate min-w-0 flex-1">
                {ob.title}
              </span>

              {/* Due date chip */}
              {dueDate && (
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded shrink-0 whitespace-nowrap",
                    isOverdue
                      ? STATUS_COLORS.overdue
                      : isUpcoming
                        ? STATUS_COLORS.upcoming
                        : "text-muted-foreground"
                  )}
                >
                  {isOverdue && "Overdue \u00b7 "}
                  {dueDate.toLocaleDateString()}
                </span>
              )}

              {/* Status badge */}
              <Badge
                variant="secondary"
                className={cn(
                  "text-xs shrink-0",
                  isOverdue
                    ? STATUS_COLORS.overdue
                    : STATUS_COLORS[ob.status] || STATUS_COLORS.active
                )}
              >
                {isOverdue ? "Overdue" : ob.status}
              </Badge>

              {/* Evidence icon button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddEvidence(ob.id);
                }}
              >
                <Paperclip className="h-4 w-4" />
              </Button>

              {/* Complete button */}
              {isCompleted ? (
                <Button variant="outline" size="sm" disabled className="shrink-0">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Completed
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCompleteDialogOpen(true);
                  }}
                >
                  Complete
                </Button>
              )}
            </div>

            {/* Expanded content */}
            <CollapsibleContent>
              <div className="mt-4 pt-3 border-t space-y-4 ml-8">
                {/* Owner */}
                {ob.owner && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Owner</span>
                    <p className="text-sm mt-0.5">{ob.owner}</p>
                  </div>
                )}

                {/* Description */}
                {ob.summary && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</span>
                    <p className="text-sm mt-0.5">{ob.summary}</p>
                  </div>
                )}

                {/* Clause reference */}
                {ob.clause_reference && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Clause</span>
                    <p className="text-sm mt-0.5">Clause: {ob.clause_reference}</p>
                  </div>
                )}

                {/* Category-specific fields */}
                {categoryFields.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Details</span>
                    <p className="text-sm mt-0.5">
                      {categoryFields.join(" | ")}
                    </p>
                  </div>
                )}

                {/* Start date */}
                {ob.start_date && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Start date</span>
                    <p className="text-sm mt-0.5">{ob.start_date}</p>
                  </div>
                )}

                {/* Repeating info */}
                {ob.is_repeating === 1 && ob.recurrence_interval && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recurrence</span>
                    <p className="text-sm mt-0.5">Repeats every {ob.recurrence_interval} days</p>
                  </div>
                )}

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
                              onClick={() => setDeletingEvidenceIndex(idx)}
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

                {/* Completion record */}
                {(ob.finalization_note || ob.finalization_document_id) && (
                  <div className={cn("rounded-md p-3 border", STATUS_COLORS.met)}>
                    <h4 className="text-xs font-medium mb-1">Completion Record</h4>
                    {ob.finalization_note && (
                      <p className="text-sm">{ob.finalization_note}</p>
                    )}
                    {ob.finalization_document_id && (
                      <p className="text-xs mt-1">Document attached (ID: {ob.finalization_document_id})</p>
                    )}
                  </div>
                )}

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

                  {ob.status === "active" ? (
                    <Select
                      value={ob.status}
                      onValueChange={(val) => onUpdateField(ob.id, "status", val)}
                    >
                      <SelectTrigger className="h-7 text-xs w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="waived">Waived</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge
                      variant="secondary"
                      className={cn("text-xs", STATUS_COLORS[ob.status] || STATUS_COLORS.active)}
                    >
                      {ob.status.charAt(0).toUpperCase() + ob.status.slice(1)}
                    </Badge>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </CardContent>
        </Collapsible>
      </Card>

      {/* Complete obligation dialog */}
      <CompleteObligationDialog
        obligationId={ob.id}
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        onCompleted={() => {
          if (onCompleted) onCompleted();
        }}
      />

      {/* Evidence removal confirmation dialog */}
      <AlertDialog
        open={deletingEvidenceIndex !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingEvidenceIndex(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Evidence</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this evidence? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingEvidenceIndex !== null) {
                  onRemoveEvidence(ob.id, deletingEvidenceIndex);
                  setDeletingEvidenceIndex(null);
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function getCategoryFields(ob: Obligation, category: string): string[] {
  const fields: string[] = [];
  switch (category) {
    case "payment":
      if (ob.payment_amount != null) fields.push(`Amount: ${ob.payment_amount}`);
      if (ob.payment_currency) fields.push(`Currency: ${ob.payment_currency}`);
      break;
    case "reporting":
      if (ob.reporting_frequency) fields.push(`Frequency: ${ob.reporting_frequency}`);
      if (ob.reporting_recipient) fields.push(`Recipient: ${ob.reporting_recipient}`);
      break;
    case "compliance":
      if (ob.compliance_regulatory_body) fields.push(`Regulatory Body: ${ob.compliance_regulatory_body}`);
      if (ob.compliance_jurisdiction) fields.push(`Jurisdiction: ${ob.compliance_jurisdiction}`);
      break;
    case "operational":
      if (ob.operational_service_type) fields.push(`Service Type: ${ob.operational_service_type}`);
      if (ob.operational_sla_metric) fields.push(`SLA Metric: ${ob.operational_sla_metric}`);
      break;
  }
  return fields;
}
