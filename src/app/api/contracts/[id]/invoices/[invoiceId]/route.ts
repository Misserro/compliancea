import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import fs from "fs";

import { ensureDb } from "@/lib/server-utils";
import {
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

const ALLOWED_CURRENCIES = ["EUR", "USD", "GBP", "PLN", "CHF"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invoiceId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['contracts'] ?? 'full';
    if (!hasPermission(perm as any, 'edit')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();
  const { id, invoiceId } = await params;
  const contractId = parseInt(id, 10);
  const invoiceIdNum = parseInt(invoiceId, 10);
  if (isNaN(contractId) || isNaN(invoiceIdNum)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const existing = getInvoiceById(invoiceIdNum);
    if (!existing || existing.contract_id !== contractId) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const allowed = ["amount", "currency", "description", "date_of_issue", "date_of_payment", "is_paid"];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Validate currency if provided
    if (updates.currency !== undefined && !ALLOWED_CURRENCIES.includes(updates.currency as string)) {
      return NextResponse.json(
        { error: `Invalid currency. Must be: ${ALLOWED_CURRENCIES.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate amount if provided
    if (updates.amount !== undefined) {
      const amount = Number(updates.amount);
      if (isNaN(amount) || amount < 0) {
        return NextResponse.json({ error: "Amount must be a non-negative number" }, { status: 400 });
      }
      updates.amount = amount;
    }

    updateInvoice(invoiceIdNum, updates);
    logAction("invoice", invoiceIdNum, "updated", updates, { userId: Number(session.user.id), orgId });

    const updated = getInvoiceById(invoiceIdNum);
    return NextResponse.json({ invoice: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invoiceId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['contracts'] ?? 'full';
    if (!hasPermission(perm as any, 'full')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();
  const { id, invoiceId } = await params;
  const contractId = parseInt(id, 10);
  const invoiceIdNum = parseInt(invoiceId, 10);
  if (isNaN(contractId) || isNaN(invoiceIdNum)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const existing = getInvoiceById(invoiceIdNum);
    if (!existing || existing.contract_id !== contractId) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Delete the DB record
    deleteInvoice(invoiceIdNum);

    // Remove associated files from disk (non-critical)
    if (existing.invoice_file_path) {
      try {
        fs.unlinkSync(existing.invoice_file_path);
      } catch (fileErr) {
        console.warn("Failed to delete invoice file:", fileErr);
      }
    }
    if (existing.payment_confirmation_path) {
      try {
        fs.unlinkSync(existing.payment_confirmation_path);
      } catch (fileErr) {
        console.warn("Failed to delete payment confirmation file:", fileErr);
      }
    }

    logAction("invoice", invoiceIdNum, "deleted", { contractId }, { userId: Number(session.user.id), orgId });

    return NextResponse.json({ message: "Invoice deleted" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
