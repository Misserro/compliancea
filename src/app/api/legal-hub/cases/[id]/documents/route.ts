export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import fs from "fs";

import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getLegalCaseById,
  getCaseDocuments,
  addCaseDocument,
  getCaseDocumentById,
  removeCaseDocument,
  addDocument,
  getDocumentById,
  setDocumentProcessingError,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { CASE_ATTACHMENTS_DIR } from "@/lib/paths-imports";

const ALLOWED_EXTENSIONS = /\.(pdf|docx)$/i;
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const VALID_CATEGORIES = [
  "pleadings", "evidence", "correspondence", "court_decisions",
  "powers_of_attorney", "contracts_annexes", "invoices_costs",
  "internal_notes", "other",
];

/**
 * GET /api/legal-hub/cases/[id]/documents
 * List all documents attached to a case
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDb();

  try {
    const params = await props.params;
    const caseId = parseInt(params.id, 10);
    if (isNaN(caseId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const legalCase = getLegalCaseById(caseId);
    if (!legalCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const documents = getCaseDocuments(caseId);

    return NextResponse.json({ case_documents: documents });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/legal-hub/cases/[id]/documents
 * Attach a document to a case (upload or link from library)
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDb();

  try {
    const params = await props.params;
    const caseId = parseInt(params.id, 10);
    if (isNaN(caseId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const legalCase = getLegalCaseById(caseId);
    if (!legalCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const mode = formData.get("mode") as string | null;

    if (!mode || !["upload", "link"].includes(mode)) {
      return NextResponse.json(
        { error: "Invalid mode. Must be: upload, link" },
        { status: 400 }
      );
    }

    const documentCategory = (formData.get("document_category") as string | null) || "other";
    if (!VALID_CATEGORIES.includes(documentCategory)) {
      return NextResponse.json(
        { error: `Invalid document_category. Must be: ${VALID_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    const label = (formData.get("label") as string | null) || null;
    const dateFiled = (formData.get("date_filed") as string | null) || null;
    const filingReference = (formData.get("filing_reference") as string | null) || null;

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

      // Save file to disk
      const caseDir = path.join(CASE_ATTACHMENTS_DIR, String(caseId));
      fs.mkdirSync(caseDir, { recursive: true });

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = path.join(caseDir, `doc_${crypto.randomUUID()}_${safeName}`);
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(filePath, buffer);

      // Add to documents table for text extraction + embeddings pipeline
      const docId = addDocument(safeName, filePath, "case-attachments", null);

      // Create case_documents link with document_id set
      const newId = addCaseDocument({
        caseId,
        documentId: docId,
        filePath,
        fileName: safeName,
        documentCategory,
        label,
        dateFiled,
        filingReference,
      });

      logAction("case_document", newId, "created", {
        caseId,
        mode: "upload",
        documentCategory,
      });

      // Trigger document processing pipeline in background — record any error to DB
      const baseUrl = request.nextUrl.origin;
      const cookieHeader = request.headers.get("cookie") || "";
      (async () => {
        try {
          const processRes = await fetch(`${baseUrl}/api/documents/${docId}/process`, {
            method: "POST",
            headers: { cookie: cookieHeader },
          });
          if (!processRes.ok) {
            const body = await processRes.json().catch(() => ({}));
            const errMsg = (body as { error?: string }).error || `Processing failed (HTTP ${processRes.status})`;
            setDocumentProcessingError(docId, errMsg);
            console.warn("Case document processing failed:", errMsg);
          }
        } catch (processErr) {
          const errMsg = processErr instanceof Error ? processErr.message : "Processing request failed";
          setDocumentProcessingError(docId, errMsg);
          console.warn("Case document processing trigger failed:", errMsg);
        }
      })();

      const doc = getCaseDocumentById(newId);
      return NextResponse.json({ case_document: doc }, { status: 201 });
    }

    // mode === "link"
    const documentIdStr = formData.get("document_id") as string | null;
    if (!documentIdStr) {
      return NextResponse.json(
        { error: "document_id is required for link mode" },
        { status: 400 }
      );
    }

    const documentId = parseInt(documentIdStr, 10);
    if (isNaN(documentId)) {
      return NextResponse.json({ error: "Invalid document_id" }, { status: 400 });
    }

    const linkedDoc = getDocumentById(documentId);
    if (!linkedDoc) {
      return NextResponse.json(
        { error: "Document not found in library" },
        { status: 404 }
      );
    }

    const newId = addCaseDocument({
      caseId,
      documentId,
      fileName: linkedDoc.name,
      documentCategory,
      label,
      dateFiled,
      filingReference,
    });

    logAction("case_document", newId, "created", {
      caseId,
      mode: "link",
      documentId,
      documentCategory,
    });

    const doc = getCaseDocumentById(newId);
    return NextResponse.json({ case_document: doc }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
