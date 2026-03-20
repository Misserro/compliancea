export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getCaseDocumentIndexingStatus } from "@/lib/db-imports";
import { hasPermission } from "@/lib/permissions";

/**
 * GET /api/legal-hub/cases/[id]/documents/status
 * Returns per-document indexing status for a case.
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
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

  const params = await props.params;
  const caseId = parseInt(params.id, 10);
  if (isNaN(caseId)) {
    return NextResponse.json([], { status: 200 });
  }

  const STUCK_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

  try {
    const rows = getCaseDocumentIndexingStatus(caseId) as Array<{
      documentId: number;
      documentName: string;
      processed: number;
      processingError: string | null;
      chunksIndexed: number;
      addedAt: string;
    }>;

    const result = rows.map((row) => {
      let status: "processing" | "indexed" | "failed";
      let errorMessage: string | undefined;

      if (row.processed && row.chunksIndexed > 0) {
        status = "indexed";
      } else if (row.processingError) {
        status = "failed";
        errorMessage = row.processingError;
      } else if (!row.processed) {
        const addedMs = row.addedAt ? new Date(row.addedAt).getTime() : 0;
        const isStuck = addedMs > 0 && Date.now() - addedMs > STUCK_TIMEOUT_MS;
        status = isStuck ? "failed" : "processing";
        if (isStuck) errorMessage = "Processing timed out — please try re-uploading";
      } else {
        // processed=1 but no chunks: image-only PDF or unsupported format
        status = "failed";
        errorMessage = "Document processed but no text could be extracted";
      }

      return {
        documentId: row.documentId,
        documentName: row.documentName,
        status,
        ...(errorMessage ? { errorMessage } : {}),
      };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.warn("Failed to get indexing status:", err);
    return NextResponse.json([], { status: 200 });
  }
}
