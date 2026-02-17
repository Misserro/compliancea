import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getObligationById, getChunksByDocumentId } from "@/lib/db-imports";
import { checkObligationCompliance } from "@/lib/contracts-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const obId = parseInt(id, 10);

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });
    }

    const ob = getObligationById(obId);
    if (!ob) {
      return NextResponse.json({ error: "Obligation not found" }, { status: 404 });
    }

    const evidence = JSON.parse(ob.evidence_json || "[]");

    // Gather evidence document content
    const evidenceDocs: { documentName: string; content: string }[] = [];
    for (const ev of evidence) {
      const chunks = getChunksByDocumentId(ev.documentId);
      if (chunks && chunks.length > 0) {
        const content = chunks.map((c: { content: string }) => c.content).join("\n\n").substring(0, 3000);
        evidenceDocs.push({ documentName: ev.documentName, content });
      }
    }

    const result = await checkObligationCompliance(ob, evidenceDocs);

    logAction("obligation", obId, "compliance_checked", {
      met: result.met,
      confidence: result.confidence,
    });

    return NextResponse.json({
      met: result.met,
      assessment: result.assessment,
      confidence: result.confidence,
      tokenUsage: { claude: result.tokenUsage },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
