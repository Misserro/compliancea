export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getCaseGeneratedDocs } from "@/lib/db-imports";

/**
 * GET /api/legal-hub/cases/[id]/generated-documents
 * List generated documents for a case
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

  await ensureDb();

  try {
    const params = await props.params;
    const caseId = parseInt(params.id, 10);
    if (isNaN(caseId)) {
      return NextResponse.json({ error: "Invalid case ID" }, { status: 400 });
    }

    const generated_documents = getCaseGeneratedDocs(caseId);
    return NextResponse.json({ generated_documents });
  } catch (err: unknown) {
    console.error("Error fetching generated documents:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
