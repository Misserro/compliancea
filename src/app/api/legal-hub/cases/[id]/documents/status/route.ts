export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getCaseDocumentIndexingStatus } from "@/lib/db-imports";

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

  await ensureDb();

  const params = await props.params;
  const caseId = parseInt(params.id, 10);
  if (isNaN(caseId)) {
    return NextResponse.json([], { status: 200 });
  }

  try {
    const rows = getCaseDocumentIndexingStatus(caseId) as Array<{
      documentId: number;
      documentName: string;
      processed: number;
      chunksIndexed: number;
    }>;

    const result = rows.map((row) => {
      let status: "processing" | "indexed" | "failed";
      if (!row.processed) {
        status = "processing";
      } else if (row.chunksIndexed > 0) {
        status = "indexed";
      } else {
        status = "failed";
      }
      return {
        documentId: row.documentId,
        documentName: row.documentName,
        status,
      };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.warn("Failed to get indexing status:", err);
    return NextResponse.json([], { status: 200 });
  }
}
