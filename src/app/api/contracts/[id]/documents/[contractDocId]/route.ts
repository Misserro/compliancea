import { NextRequest, NextResponse } from "next/server";
import fs from "fs";

import { ensureDb } from "@/lib/server-utils";
import { getContractDocumentById, deleteContractDocument } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contractDocId: string }> }
) {
  await ensureDb();
  const { id, contractDocId } = await params;
  const contractId = parseInt(id, 10);
  const contractDocIdNum = parseInt(contractDocId, 10);
  if (isNaN(contractId) || isNaN(contractDocIdNum)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const existing = getContractDocumentById(contractDocIdNum);
    if (!existing || existing.contract_id !== contractId) {
      return NextResponse.json({ error: "Contract document not found" }, { status: 404 });
    }

    // Delete the DB record
    deleteContractDocument(contractDocIdNum);

    // Remove file from disk if it was an upload (non-critical)
    if (existing.file_path) {
      try {
        fs.unlinkSync(existing.file_path);
      } catch (fileErr) {
        console.warn("Failed to delete contract document file:", fileErr);
      }
    }

    logAction("contract_document", contractDocIdNum, "deleted", { contractId });

    return NextResponse.json({ message: "Contract document deleted" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
