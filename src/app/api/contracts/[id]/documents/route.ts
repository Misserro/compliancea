import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import crypto from "crypto";
import path from "path";
import fs from "fs";

import { ensureDb } from "@/lib/server-utils";
import {
  getContractById,
  getContractDocuments,
  getDocumentById,
  addContractDocumentUpload,
  linkContractDocument,
  getContractDocumentById,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { CONTRACT_ATTACHMENTS_DIR } from "@/lib/paths-imports";

export const runtime = "nodejs";

const ALLOWED_EXTENSIONS = /\.(pdf|docx)$/i;
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_DOCUMENT_TYPES = ["amendment", "addendum", "exhibit", "other"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);

  await ensureDb();
  const { id } = await params;
  const contractId = parseInt(id, 10);
  if (isNaN(contractId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const contract = getContractById(contractId, orgId);
    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    const documents = getContractDocuments(contractId);

    return NextResponse.json({ documents });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);

  await ensureDb();
  const { id } = await params;
  const contractId = parseInt(id, 10);
  if (isNaN(contractId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const contract = getContractById(contractId, orgId);
    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const mode = formData.get("mode") as string | null;

    if (!mode || !["upload", "link"].includes(mode)) {
      return NextResponse.json(
        { error: "Invalid mode. Must be: upload, link" },
        { status: 400 }
      );
    }

    const documentType = (formData.get("document_type") as string | null) || "other";
    if (!ALLOWED_DOCUMENT_TYPES.includes(documentType)) {
      return NextResponse.json(
        { error: `Invalid document_type. Must be: ${ALLOWED_DOCUMENT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const label = (formData.get("label") as string | null) || null;

    if (mode === "upload") {
      const file = formData.get("file") as File | null;
      if (!file || file.size === 0) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }

      if (!ALLOWED_EXTENSIONS.test(file.name)) {
        return NextResponse.json(
          { error: "Only PDF and DOCX files are allowed" },
          { status: 400 }
        );
      }

      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: "Invalid file type" },
          { status: 400 }
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "File size exceeds 10MB limit" },
          { status: 400 }
        );
      }

      const contractDir = path.join(CONTRACT_ATTACHMENTS_DIR, String(contractId));
      fs.mkdirSync(contractDir, { recursive: true });

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = path.join(contractDir, `doc_${crypto.randomUUID()}_${safeName}`);
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(filePath, buffer);

      const newId = addContractDocumentUpload({
        contractId,
        filePath,
        fileName: safeName,
        documentType,
        label,
      });

      logAction("contract_document", newId, "created", { contractId, mode: "upload", documentType }, { userId: Number(session.user.id), orgId });

      const doc = getContractDocumentById(newId);
      return NextResponse.json({ document: doc }, { status: 201 });
    }

    // mode === "link"
    const documentIdStr = formData.get("document_id") as string | null;
    if (!documentIdStr) {
      return NextResponse.json({ error: "document_id is required for link mode" }, { status: 400 });
    }

    const documentId = parseInt(documentIdStr, 10);
    if (isNaN(documentId)) {
      return NextResponse.json({ error: "Invalid document_id" }, { status: 400 });
    }

    const linkedDoc = getDocumentById(documentId, orgId);
    if (!linkedDoc) {
      return NextResponse.json({ error: "Document not found in library" }, { status: 404 });
    }

    const newId = linkContractDocument({
      contractId,
      documentId,
      documentType,
      label,
    });

    logAction("contract_document", newId, "created", { contractId, mode: "link", documentId, documentType }, { userId: Number(session.user.id), orgId });

    const doc = getContractDocumentById(newId);
    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
