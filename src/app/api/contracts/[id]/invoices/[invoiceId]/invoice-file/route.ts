import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import path from "path";

import { ensureDb } from "@/lib/server-utils";
import { getInvoiceById } from "@/lib/db-imports";
import { getFile } from "@/lib/storage-imports";
import { hasPermission } from "@/lib/permissions";

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
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['contracts'] ?? 'full';
    if (!hasPermission(perm as any, 'view')) {
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
    const invoice = getInvoiceById(invoiceIdNum);
    if (!invoice || invoice.contract_id !== contractId) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (!invoice.invoice_file_path && !invoice.invoice_storage_key) {
      return NextResponse.json({ error: "No invoice file attached" }, { status: 404 });
    }

    // Read file via storage driver (handles S3 and local)
    const fileBuffer = await getFile(
      orgId,
      invoice.invoice_storage_backend || "local",
      invoice.invoice_storage_key,
      invoice.invoice_file_path
    );

    const fileName = path.basename(invoice.invoice_file_path || invoice.invoice_storage_key || "file");
    const ext = path.extname(fileName).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

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
