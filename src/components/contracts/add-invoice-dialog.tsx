"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "next-intl";
import { INVOICE_CURRENCIES } from "@/lib/constants";
import type { Invoice } from "@/lib/types";

interface AddInvoiceDialogProps {
  contractId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editInvoice?: Invoice | null;
}

export function AddInvoiceDialog({
  contractId,
  open,
  onOpenChange,
  onSaved,
  editInvoice,
}: AddInvoiceDialogProps) {
  const t = useTranslations('Contracts');
  const isEdit = !!editInvoice;
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState(editInvoice ? String(editInvoice.amount) : "");
  const [currency, setCurrency] = useState(editInvoice?.currency || "EUR");
  const [description, setDescription] = useState(editInvoice?.description || "");
  const [dateOfIssue, setDateOfIssue] = useState(editInvoice?.date_of_issue || "");
  const [dateOfPayment, setDateOfPayment] = useState(editInvoice?.date_of_payment || "");
  const invoiceFileRef = useRef<HTMLInputElement>(null);
  const paymentFileRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setAmount("");
    setCurrency("EUR");
    setDescription("");
    setDateOfIssue("");
    setDateOfPayment("");
    if (invoiceFileRef.current) invoiceFileRef.current.value = "";
    if (paymentFileRef.current) paymentFileRef.current.value = "";
  };

  const handleSave = async () => {
    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum < 0) {
      toast.error(t('addInvoiceDialog.validAmountError'));
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        // PATCH — JSON body, no file upload
        const body: Record<string, unknown> = {
          amount: amountNum,
          currency,
          description: description || null,
          date_of_issue: dateOfIssue || null,
          date_of_payment: dateOfPayment || null,
        };

        const res = await fetch(
          `/api/contracts/${contractId}/invoices/${editInvoice.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        const data = await res.json();
        if (res.ok) {
          toast.success(t('addInvoiceDialog.updated'));
          onSaved();
          onOpenChange(false);
        } else {
          toast.error(data.error || t('addInvoiceDialog.saveFailed'));
        }
      } else {
        // POST — multipart form data
        const formData = new FormData();
        formData.append("amount", String(amountNum));
        formData.append("currency", currency);
        if (description) formData.append("description", description);
        if (dateOfIssue) formData.append("date_of_issue", dateOfIssue);
        if (dateOfPayment) formData.append("date_of_payment", dateOfPayment);

        const invoiceFile = invoiceFileRef.current?.files?.[0];
        if (invoiceFile) {
          formData.append("invoice_file", invoiceFile);
        }
        const paymentFile = paymentFileRef.current?.files?.[0];
        if (paymentFile) {
          formData.append("payment_confirmation_file", paymentFile);
        }

        const res = await fetch(`/api/contracts/${contractId}/invoices`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (res.ok) {
          toast.success(t('addInvoiceDialog.added'));
          resetForm();
          onSaved();
          onOpenChange(false);
        } else {
          toast.error(data.error || t('addInvoiceDialog.saveFailed'));
        }
      }
    } catch (err) {
      toast.error(t('addInvoiceDialog.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('addInvoiceDialog.editTitle') : t('addInvoiceDialog.addTitle')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="invoice-amount">{t('addInvoiceDialog.amount')}</Label>
              <Input
                id="invoice-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="invoice-currency">{t('addInvoiceDialog.currency')}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="invoice-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVOICE_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="invoice-description">{t('addInvoiceDialog.description')}</Label>
            <Input
              id="invoice-description"
              placeholder={t('addInvoiceDialog.descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="invoice-date-issue">{t('addInvoiceDialog.dateOfIssue')}</Label>
              <Input
                id="invoice-date-issue"
                type="date"
                value={dateOfIssue}
                onChange={(e) => setDateOfIssue(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="invoice-date-payment">{t('addInvoiceDialog.dateOfPayment')}</Label>
              <Input
                id="invoice-date-payment"
                type="date"
                value={dateOfPayment}
                onChange={(e) => setDateOfPayment(e.target.value)}
              />
            </div>
          </div>

          {!isEdit && (
            <>
              <div>
                <Label htmlFor="invoice-file">{t('addInvoiceDialog.invoiceFile')}</Label>
                <Input
                  id="invoice-file"
                  type="file"
                  accept=".pdf,.docx,.jpg,.png"
                  ref={invoiceFileRef}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('addInvoiceDialog.fileHint')}
                </p>
              </div>

              <div>
                <Label htmlFor="payment-confirmation-file">{t('addInvoiceDialog.paymentConfirmation')}</Label>
                <Input
                  id="payment-confirmation-file"
                  type="file"
                  accept=".pdf,.docx,.jpg,.png"
                  ref={paymentFileRef}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('addInvoiceDialog.fileHint')}
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('addInvoiceDialog.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('addInvoiceDialog.saving') : isEdit ? t('addInvoiceDialog.update') : t('addInvoiceDialog.addInvoice')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
