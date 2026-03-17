import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import fs from "fs";

import { ensureDb } from "@/lib/server-utils";
import {
  getInvoicesByContractId,
  getContractInvoiceSummary,
  getContractById,
  insertInvoice,
  getInvoiceById,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { INVOICES_DIR } from "@/lib/paths-imports";

export const runtime = "nodejs";

const ALLOWED_EXTENSIONS = /\.(pdf|docx|jpg|png)$/i;
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_CURRENCIES = ["EUR", "USD", "GBP", "PLN", "CHF"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const contractId = parseInt(id, 10);
  if (isNaN(contractId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const contract = getContractById(contractId);
    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    const invoices = getInvoicesByContractId(contractId);
    const summary = getContractInvoiceSummary(contractId);

    return NextResponse.json({ invoices, summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const contractId = parseInt(id, 10);
  if (isNaN(contractId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const contract = getContractById(contractId);
    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    const formData = await request.formData();

    // Required fields
    const amountStr = formData.get("amount") as string | null;
    if (!amountStr) {
      return NextResponse.json({ error: "Amount is required" }, { status: 400 });
    }
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount < 0) {
      return NextResponse.json({ error: "Amount must be a non-negative number" }, { status: 400 });
    }

    const currency = (formData.get("currency") as string | null) || "EUR";
    if (!ALLOWED_CURRENCIES.includes(currency)) {
      return NextResponse.json(
        { error: `Invalid currency. Must be: ${ALLOWED_CURRENCIES.join(", ")}` },
        { status: 400 }
      );
    }

    // Optional fields
    const description = (formData.get("description") as string | null) || null;
    const dateOfIssue = (formData.get("date_of_issue") as string | null) || null;
    const dateOfPayment = (formData.get("date_of_payment") as string | null) || null;

    // File uploads
    const invoiceFile = formData.get("invoice_file") as File | null;
    const paymentConfirmationFile = formData.get("payment_confirmation_file") as File | null;

    let invoiceFilePath: string | null = null;
    let paymentConfirmationPath: string | null = null;

    const contractDir = path.join(INVOICES_DIR, String(contractId));

    // Validate and save invoice file
    if (invoiceFile && invoiceFile.size > 0) {
      if (!ALLOWED_EXTENSIONS.test(invoiceFile.name)) {
        return NextResponse.json(
          { error: "Invoice file must be PDF, DOCX, JPG, or PNG" },
          { status: 400 }
        );
      }
      if (!ALLOWED_MIME_TYPES.includes(invoiceFile.type)) {
        return NextResponse.json(
          { error: "Invalid file type" },
          { status: 400 }
        );
      }
      if (invoiceFile.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "Invoice file exceeds 10MB limit" },
          { status: 400 }
        );
      }
      fs.mkdirSync(contractDir, { recursive: true });
      const safeName = invoiceFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      invoiceFilePath = path.join(contractDir, `inv_${crypto.randomUUID()}_${safeName}`);
      const buffer = Buffer.from(await invoiceFile.arrayBuffer());
      fs.writeFileSync(invoiceFilePath, buffer);
    }

    // Validate and save payment confirmation file
    if (paymentConfirmationFile && paymentConfirmationFile.size > 0) {
      if (!ALLOWED_EXTENSIONS.test(paymentConfirmationFile.name)) {
        return NextResponse.json(
          { error: "Payment confirmation file must be PDF, DOCX, JPG, or PNG" },
          { status: 400 }
        );
      }
      if (!ALLOWED_MIME_TYPES.includes(paymentConfirmationFile.type)) {
        return NextResponse.json(
          { error: "Invalid file type" },
          { status: 400 }
        );
      }
      if (paymentConfirmationFile.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "Payment confirmation file exceeds 10MB limit" },
          { status: 400 }
        );
      }
      fs.mkdirSync(contractDir, { recursive: true });
      const safeName = paymentConfirmationFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      paymentConfirmationPath = path.join(contractDir, `pay_${crypto.randomUUID()}_${safeName}`);
      const buffer = Buffer.from(await paymentConfirmationFile.arrayBuffer());
      fs.writeFileSync(paymentConfirmationPath, buffer);
    }

    const newId = insertInvoice({
      contractId,
      amount,
      currency,
      description,
      dateOfIssue,
      dateOfPayment,
      isPaid: false,
      invoiceFilePath,
      paymentConfirmationPath,
    });

    logAction("invoice", newId, "created", { contractId, amount, currency });

    const invoice = getInvoiceById(newId);
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
