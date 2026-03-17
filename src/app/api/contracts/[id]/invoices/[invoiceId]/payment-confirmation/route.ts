import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import { ensureDb } from "@/lib/server-utils";
import { getInvoiceById } from "@/lib/db-imports";
import { INVOICES_DIR } from "@/lib/paths-imports";

export const runtime = "nodejs";

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invoiceId: string }> }
) {
  await ensureDb();
  const { id, invoiceId } = await params;
  const contractId = parseInt(id, 10);
  const invoiceIdNum = parseInt(invoiceId, 10);
  if (isNaN(contractId) || isNaN(invoiceIdNum)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const invoice = getInvoiceById(invoiceIdNum);
    if (!invoice || invoice.contract_id !== contractId) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (!invoice.payment_confirmation_path) {
      return NextResponse.json({ error: "No payment confirmation file attached" }, { status: 404 });
    }

    // Path traversal prevention
    const resolvedPath = path.resolve(invoice.payment_confirmation_path);
    const resolvedInvoicesDir = path.resolve(INVOICES_DIR);
    if (!resolvedPath.startsWith(resolvedInvoicesDir)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Verify file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      return NextResponse.json({ error: "Payment confirmation file not found on disk" }, { status: 404 });
    }

    const fileBuffer = await fs.readFile(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const fileName = path.basename(resolvedPath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
