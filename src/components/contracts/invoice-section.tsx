"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, FileText, Receipt } from "lucide-react";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { INVOICE_STATUS_COLORS } from "@/lib/constants";
import type { Invoice, InvoiceSummary } from "@/lib/types";
import { AddInvoiceDialog } from "./add-invoice-dialog";

interface InvoiceSectionProps {
  contractId: number;
  onUpdate?: () => void;
}

function formatCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = {
    EUR: "\u20AC",
    USD: "$",
    GBP: "\u00A3",
    PLN: "z\u0142",
    CHF: "CHF\u00A0",
  };
  const symbol = symbols[currency] || currency + "\u00A0";
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getInvoiceStatus(invoice: Invoice): "paid" | "overdue" | "pending" {
  if (invoice.is_paid) return "paid";
  if (invoice.date_of_payment) {
    const today = new Date().toISOString().slice(0, 10);
    if (invoice.date_of_payment < today) return "overdue";
  }
  return "pending";
}

export function InvoiceSection({ contractId, onUpdate }: InvoiceSectionProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<InvoiceSummary>({ totalInvoiced: 0, totalPaid: 0, overdueCount: 0 });
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<number | null>(null);
  const t = useTranslations("Contracts");
  const tCommon = useTranslations("Common");
  const locale = useLocale();

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "\u2014";
    try {
      return new Date(dateString + "T00:00:00").toLocaleDateString(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch(`/api/contracts/${contractId}/invoices`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices || []);
        setSummary(data.summary || { totalInvoiced: 0, totalPaid: 0, overdueCount: 0 });
      }
    } catch (err) {
      console.warn("Failed to fetch invoices:", err);
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleDeleteInvoice = async (id: number) => {
    try {
      const res = await fetch(
        `/api/contracts/${contractId}/invoices/${id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        toast.success(t("invoices.deleted"));
        fetchInvoices();
        onUpdate?.();
      } else {
        const data = await res.json();
        toast.error(data.error || t("invoices.deleteFailed"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("invoices.deleteFailed"));
    }
  };

  const handleTogglePaid = async (invoice: Invoice) => {
    try {
      const res = await fetch(
        `/api/contracts/${contractId}/invoices/${invoice.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_paid: invoice.is_paid ? 0 : 1 }),
        }
      );
      if (res.ok) {
        toast.success(invoice.is_paid ? t("invoices.markedUnpaid") : t("invoices.markedPaid"));
        fetchInvoices();
        onUpdate?.();
      } else {
        const data = await res.json();
        toast.error(data.error || t("invoices.updateFailed"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("invoices.updateFailed"));
    }
  };

  const handleEdit = (invoice: Invoice) => {
    setEditInvoice(invoice);
    setDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditInvoice(null);
  };

  const handleSaved = () => {
    fetchInvoices();
    onUpdate?.();
  };

  // Determine the most common currency for the summary display
  const primaryCurrency = invoices.length > 0 ? invoices[0].currency : "EUR";

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-2">{t("invoices.loading")}</div>
    );
  }

  return (
    <div data-slot="invoice-section">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-foreground">{t("invoices.title")}</h4>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditInvoice(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          {t("invoices.add")}
        </Button>
      </div>

      {/* Summary row */}
      {invoices.length > 0 && (
        <div className="flex items-center gap-4 text-sm mb-3 p-2 rounded bg-muted/50">
          <span>
            <span className="text-muted-foreground">{t("invoices.totalInvoiced")}</span>{" "}
            <span className="font-medium">{formatCurrency(summary.totalInvoiced, primaryCurrency)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">{t("invoices.totalPaid")}</span>{" "}
            <span className="font-medium">{formatCurrency(summary.totalPaid, primaryCurrency)}</span>
          </span>
          {summary.overdueCount > 0 && (
            <Badge className={cn(INVOICE_STATUS_COLORS.overdue)}>
              {t("invoices.overdueCount", { count: summary.overdueCount })}
            </Badge>
          )}
        </div>
      )}

      {/* Invoice list */}
      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("invoices.noInvoices")}</p>
      ) : (
        <div className="space-y-2">
          {invoices.map((invoice) => {
            const status = getInvoiceStatus(invoice);
            const statusLabel = status === "paid" ? t("invoices.paid") : status === "overdue" ? t("invoices.overdue") : t("invoices.pending");
            return (
              <div
                key={invoice.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded border bg-card text-sm"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    <Badge className={cn(INVOICE_STATUS_COLORS[status])}>
                      {statusLabel}
                    </Badge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {formatCurrency(invoice.amount, invoice.currency)}
                      {invoice.description && (
                        <span className="text-muted-foreground font-normal ml-2 truncate">
                          {invoice.description}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {invoice.date_of_issue && (
                        <span>{t("invoices.issued", { date: formatDate(invoice.date_of_issue) })}</span>
                      )}
                      {invoice.date_of_payment && (
                        <span className="ml-2">{t("invoices.due", { date: formatDate(invoice.date_of_payment) })}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* File download links */}
                  {invoice.invoice_file_path && (
                    <a
                      href={`/api/contracts/${contractId}/invoices/${invoice.id}/invoice-file`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded hover:bg-muted transition-colors"
                      title={t("invoices.downloadInvoice")}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    </a>
                  )}
                  {invoice.payment_confirmation_path && (
                    <a
                      href={`/api/contracts/${contractId}/invoices/${invoice.id}/payment-confirmation`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded hover:bg-muted transition-colors"
                      title={t("invoices.downloadConfirmation")}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Receipt className="w-3.5 h-3.5 text-muted-foreground" />
                    </a>
                  )}

                  {/* Toggle paid */}
                  <button
                    className={cn(
                      "px-2 py-1 rounded text-xs font-medium transition-colors",
                      invoice.is_paid
                        ? "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
                        : "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-200 dark:hover:bg-green-800"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePaid(invoice);
                    }}
                    title={invoice.is_paid ? t("invoices.markAsUnpaid") : t("invoices.markAsPaid")}
                  >
                    {invoice.is_paid ? t("invoices.unpay") : t("invoices.pay")}
                  </button>

                  {/* Edit */}
                  <button
                    className="p-1.5 rounded hover:bg-muted transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(invoice);
                    }}
                    title={t("invoices.editInvoice")}
                  >
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>

                  {/* Delete */}
                  <button
                    className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingInvoiceId(invoice.id);
                    }}
                    title={t("invoices.deleteInvoice")}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddInvoiceDialog
        contractId={contractId}
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        onSaved={handleSaved}
        editInvoice={editInvoice}
      />

      <AlertDialog
        open={deletingInvoiceId !== null}
        onOpenChange={(open) => !open && setDeletingInvoiceId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("invoices.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("invoices.deleteConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingInvoiceId) {
                  handleDeleteInvoice(deletingInvoiceId);
                  setDeletingInvoiceId(null);
                }
              }}
            >
              {tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
