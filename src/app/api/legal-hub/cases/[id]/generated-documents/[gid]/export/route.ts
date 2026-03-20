export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getCaseGeneratedDocById,
  updateCaseGeneratedDoc,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { DOCUMENTS_DIR } from "@/lib/paths-imports";
import { htmlToDocx } from "@/lib/docx-export-imports";
import { hasPermission } from "@/lib/permissions";

/**
 * GET /api/legal-hub/cases/[id]/generated-documents/[gid]/export
 * Export a generated document as DOCX
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string; gid: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['legal_hub'] ?? 'full';
    if (!hasPermission(perm as any, 'view')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();

  try {
    const params = await props.params;
    const caseId = parseInt(params.id, 10);
    const gid = parseInt(params.gid, 10);
    if (isNaN(caseId) || isNaN(gid)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const doc = getCaseGeneratedDocById(gid);
    if (!doc) {
      return NextResponse.json(
        { error: "Generated document not found" },
        { status: 404 }
      );
    }

    const buffer = await htmlToDocx(
      doc.generated_content,
      doc.document_name
    );

    // Save file to disk
    const exportDir = path.join(
      DOCUMENTS_DIR,
      "case-generated",
      String(caseId)
    );
    fs.mkdirSync(exportDir, { recursive: true });

    const safeName = (doc.document_name || "document")
      .replace(/[^a-zA-Z0-9._\- ]/g, "_")
      .substring(0, 100);
    const fileName = `${safeName}.docx`;
    const filePath = path.join(exportDir, fileName);
    fs.writeFileSync(filePath, buffer);

    // Update file_path on the generated doc
    updateCaseGeneratedDoc(gid, { file_path: filePath });
    logAction("legal_case", caseId, "document_exported", { docId: gid, documentName: doc.document_name }, { userId: Number(session.user.id), orgId });

    // Return the DOCX as a download
    const uint8 = new Uint8Array(buffer);
    return new Response(uint8, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err: unknown) {
    console.error("Error exporting document:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
