import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import {
  getDocumentById,
  updateDocumentStatus,
  transitionObligationsByStage,
  createTaskForObligation,
  createSystemObligation,
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

    const validActions = ["sign", "activate", "terminate", "unsign", "deactivate", "reactivate"];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${validActions.join(", ")}` },
        { status: 400 }
      );
    }

    const doc = getDocumentById(docId);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const actionToStatus: Record<string, string> = {
      sign: "signed",
      activate: "active",
      terminate: "terminated",
      unsign: "unsigned",
      deactivate: "signed",
      reactivate: "active",
    };
    const previousStageMap: Record<string, string> = {
      sign: "not_signed",
      activate: "signed",
      terminate: "active",
      unsign: "signed",
      deactivate: "active",
      reactivate: "terminated",
    };
    const newStatus = actionToStatus[action];
    const previousStage = previousStageMap[action];

    // Map contract status to obligation stage name (they differ for "unsigned" → "not_signed")
    const statusToStage: Record<string, string> = {
      unsigned: "not_signed",
      signed: "signed",
      active: "active",
      terminated: "terminated",
    };
    const newStage = statusToStage[newStatus] || newStatus;

    const statusResult = updateDocumentStatus(docId, newStatus);
    if (!statusResult.success) {
      return NextResponse.json({ error: statusResult.error }, { status: 400 });
    }

    // Transition obligations: activate new stage, deactivate all others
    const updatedObligations = transitionObligationsByStage(docId, newStage, previousStage);

    const activated = updatedObligations.filter(
      (o: { stage: string; status: string }) => o.stage === newStage && o.status === "active"
    );
    const deactivated = updatedObligations.filter(
      (o: { stage: string; status: string }) => o.stage !== newStage && o.status === "inactive"
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

    // Create system obligations for forward lifecycle actions only
    if (action === "sign") {
      createSystemObligation(docId, "system_sign");
    } else if (action === "terminate") {
      createSystemObligation(docId, "system_terminate");
    }

    logAction("document", docId, `contract_${action}`, {
      from: statusResult.from,
      to: statusResult.to,
      activatedCount: activated.length,
      deactivatedCount: deactivated.length,
      tasksCreated,
    });

    const actionLabels: Record<string, string> = {
      sign: "signed",
      activate: "activated",
      terminate: "terminated",
      unsign: "reverted to unsigned",
      deactivate: "reverted to signed",
      reactivate: "reactivated",
    };

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
      deactivated: deactivated.map((o: { id: number; title: string; category: string; stage: string }) => ({
        id: o.id,
        title: o.title,
        category: o.category,
        stage: o.stage,
      })),
      tasksCreated,
      message: `Contract ${actionLabels[action] || action} successfully. ${activated.length} obligations activated, ${deactivated.length} deactivated.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
