"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import type { Invoice } from "@/lib/types";

interface ContractGDriveInvoicesSectionProps {
  contractId: number;
}

export function ContractGDriveInvoicesSection({ contractId }: ContractGDriveInvoicesSectionProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const t = useTranslations("Contracts");
  const locale = useLocale();

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
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
        const allInvoices: Invoice[] = data.invoices || [];
        setInvoices(allInvoices.filter((inv) => inv.document_id != null));
      }
    } catch (err) {
      console.warn("Failed to fetch GDrive invoices:", err);
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  if (loading || invoices.length === 0) return null;

  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-2">{t("linkedInvoices")}</div>
      <div className="space-y-1">
        {invoices.map((inv) => (
          <div key={inv.id} className="text-sm flex items-center justify-between">
            <span>{inv.description || String(inv.id)}</span>
            <span className="text-muted-foreground">
              {inv.amount} {inv.currency}
              {inv.date_of_payment && (
                <> &middot; {t("due")}: {formatDate(inv.date_of_payment)}</>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
