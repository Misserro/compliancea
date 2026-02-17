import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import {
  getDocumentById,
  updateDocumentStatus,
  transitionObligationsByStage,
  createTaskForObligation,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const docId = parseInt(id, 10);

  try {
    const body = await request.json();
    const { action } = body;

    if (!["sign", "activate", "terminate"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be: sign, activate, or terminate" },
        { status: 400 }
      );
    }

    const doc = getDocumentById(docId);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const actionToStatus: Record<string, string> = { sign: "signed", activate: "active", terminate: "terminated" };
    const previousStageMap: Record<string, string> = { sign: "not_signed", activate: "signed", terminate: "active" };
    const newStatus = actionToStatus[action];
    const previousStage = previousStageMap[action];

    const statusResult = updateDocumentStatus(docId, newStatus);
    if (!statusResult.success) {
      return NextResponse.json({ error: statusResult.error }, { status: 400 });
    }

    // Transition obligations: activate new stage, finalize previous stage
    const updatedObligations = transitionObligationsByStage(docId, newStatus, previousStage);

    const activated = updatedObligations.filter(
      (o: { stage: string; status: string }) => o.stage === newStatus && o.status === "active"
    );
    const finalized = updatedObligations.filter(
      (o: { status: string }) => o.status === "finalized"
    );

    // Create tasks for newly activated obligations
    let tasksCreated = 0;
    for (const ob of activated) {
      try {
        const details = ob.details_json ? JSON.parse(ob.details_json) : {};
        const dueDates = details.due_dates || [];
        for (const dd of dueDates) {
          if (dd.date) {
            createTaskForObligation(ob.id, {
              title: `${dd.label || ob.title}${dd.amount ? ` — ${dd.amount}` : ""} — ${doc.name}`,
              description: dd.details || ob.summary || ob.description,
              dueDate: dd.date,
              owner: ob.owner,
              escalationTo: null,
            });
            tasksCreated++;
          }
        }
      } catch (taskErr: unknown) {
        const msg = taskErr instanceof Error ? taskErr.message : "Unknown error";
        console.warn(`Failed to create tasks for obligation ${ob.id}:`, msg);
      }
    }

    logAction("document", docId, `contract_${action}`, {
      from: statusResult.from,
      to: statusResult.to,
      activatedCount: activated.length,
      finalizedCount: finalized.length,
      tasksCreated,
    });

    return NextResponse.json({
      success: true,
      newStatus,
      from: statusResult.from,
      activated: activated.map((o: { id: number; title: string; category: string; stage: string }) => ({
        id: o.id,
        title: o.title,
        category: o.category,
        stage: o.stage,
      })),
      finalized: finalized.map((o: { id: number; title: string; category: string; stage: string }) => ({
        id: o.id,
        title: o.title,
        category: o.category,
        stage: o.stage,
      })),
      tasksCreated,
      message: `Contract ${action === "sign" ? "signed" : action === "activate" ? "activated" : "terminated"} successfully. ${activated.length} obligations activated, ${finalized.length} finalized.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
