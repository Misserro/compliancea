import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getDocumentLineage } from "@/lib/db-imports";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const documentId = parseInt(id, 10);

  try {
    const lineage = getDocumentLineage(documentId);
    return NextResponse.json({ lineage });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
