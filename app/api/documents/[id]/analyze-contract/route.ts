import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import {
  getDocumentById,
  getChunksByDocumentId,
  insertObligation,
  getObligationById,
  createTaskForObligation,
} from "@/lib/db-imports";
import { extractContractTerms } from "@/lib/contracts-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const docId = parseInt(id, 10);

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });
    }

    const doc = getDocumentById(docId);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (!doc.processed) {
      return NextResponse.json({ error: "Document must be processed first" }, { status: 400 });
    }

    // Reconstruct text from chunks or full_text
    let fullText = "";
    if (doc.full_text) {
      fullText = doc.full_text;
    } else {
      const chunks = getChunksByDocumentId(docId);
      if (!chunks || chunks.length === 0) {
        return NextResponse.json({ error: "No text chunks found. Process the document first." }, { status: 400 });
      }
      fullText = chunks.map((c: { content: string }) => c.content).join("\n\n");
    }

    // Extract contract terms via Claude
    const result = await extractContractTerms(fullText);

    // Create obligation records
    const createdObligations = [];
    let tasksCreated = 0;

    for (const ob of result.obligations) {
      const firstDueDate = ob.due_dates.length > 0 ? ob.due_dates[0].date : null;
      const detailsJson = JSON.stringify({
        due_dates: ob.due_dates,
        key_values: ob.key_values,
        clause_references: ob.clause_references,
      });

      const obligationId = insertObligation({
        documentId: docId,
        obligationType: ob.category,
        title: ob.title,
        description: ob.summary,
        clauseReference: ob.clause_references.join(", ") || null,
        dueDate: firstDueDate,
        recurrence: ob.recurrence,
        noticePeriodDays: ob.notice_period_days,
        owner: ob.suggested_owner,
        escalationTo: null,
        proofDescription: ob.proof_description,
        evidenceJson: "[]",
        category: ob.category,
        activation: ob.activation,
        summary: ob.summary,
        detailsJson,
        penalties: ob.penalties,
        stage: ob.stage,
      });

      const created = getObligationById(obligationId);
      createdObligations.push(created);

      // Create tasks for each due_date in active obligations
      if (ob.activation === "active" && ob.due_dates.length > 0) {
        for (const dd of ob.due_dates) {
          if (dd.date) {
            createTaskForObligation(obligationId, {
              title: `${dd.label || ob.title}${dd.amount ? ` — ${dd.amount}` : ""} — ${doc.name}`,
              description: dd.details || ob.summary,
              dueDate: dd.date,
              owner: ob.suggested_owner,
              escalationTo: null,
            });
            tasksCreated++;
          }
        }
      }
    }

    logAction("document", docId, "contract_analyzed", {
      obligationsCount: createdObligations.length,
      tasksCreated,
    });

    return NextResponse.json({
      parties: result.parties,
      effective_date: result.effective_date,
      expiry_date: result.expiry_date,
      obligations: createdObligations,
      tasksCreated,
      tokenUsage: { claude: result.tokenUsage },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
