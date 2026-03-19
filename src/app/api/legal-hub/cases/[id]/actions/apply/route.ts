export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getLegalCaseById,
  updateLegalCase,
  addCaseParty,
  updateCaseParty,
  addCaseDeadline,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

interface ActionItem {
  tool: string;
  params: Record<string, unknown>;
}

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
    const { id: idStr } = await props.params;
    const caseId = parseInt(idStr, 10);
    if (isNaN(caseId)) {
      return NextResponse.json({ error: "Invalid case ID" }, { status: 400 });
    }

    const legalCase = getLegalCaseById(caseId) as Record<string, unknown> | null;
    if (!legalCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const body = await request.json();
    const actions: ActionItem[] = body.actions;

    if (!Array.isArray(actions) || actions.length === 0) {
      return NextResponse.json(
        { error: "actions array is required and must not be empty" },
        { status: 400 }
      );
    }

    const applied: string[] = [];
    const errors: string[] = [];

    for (const action of actions) {
      const { tool, params } = action;
      try {
        switch (tool) {
          case "updateCaseMetadata": {
            updateLegalCase(caseId, params);
            logAction("legal_case", caseId, "ai_mutation", { tool, params });
            applied.push(`Updated case metadata: ${Object.keys(params).join(", ")}`);
            break;
          }

          case "addParty": {
            addCaseParty({
              caseId,
              partyType: params.party_type as string,
              name: params.name as string,
              address: (params.address as string) || null,
              representativeName: (params.representative_name as string) || null,
              representativeAddress: (params.representative_address as string) || null,
              representativeType: (params.representative_type as string) || null,
              notes: (params.notes as string) || null,
            });
            logAction("legal_case", caseId, "ai_mutation", { tool, params });
            applied.push(`Added party: ${params.name} (${params.party_type})`);
            break;
          }

          case "updateParty": {
            const partyId = params.party_id as number;
            const updateFields: Record<string, unknown> = {};
            if (params.name !== undefined) updateFields.name = params.name;
            if (params.address !== undefined) updateFields.address = params.address;
            if (params.representative_name !== undefined)
              updateFields.representative_name = params.representative_name;
            if (params.representative_address !== undefined)
              updateFields.representative_address = params.representative_address;
            if (params.representative_type !== undefined)
              updateFields.representative_type = params.representative_type;
            if (params.notes !== undefined) updateFields.notes = params.notes;
            updateCaseParty(partyId, updateFields);
            logAction("legal_case", caseId, "ai_mutation", { tool, params });
            applied.push(`Updated party ID ${partyId}`);
            break;
          }

          case "addDeadline": {
            addCaseDeadline({
              caseId,
              title: params.title as string,
              deadlineType: params.deadline_type as string,
              dueDate: params.due_date as string,
              description: (params.description as string) || null,
            });
            logAction("legal_case", caseId, "ai_mutation", { tool, params });
            applied.push(`Added deadline: ${params.title} (${params.due_date})`);
            break;
          }

          case "updateCaseStatus": {
            const newStatus = params.status as string;
            const note = (params.note as string) || null;

            // Re-read case to get fresh status_history_json
            const currentCase = getLegalCaseById(caseId) as Record<string, unknown> | null;
            const history: Array<Record<string, unknown>> = [];
            try {
              const existing = JSON.parse(
                (currentCase?.status_history_json as string) || "[]"
              );
              if (Array.isArray(existing)) history.push(...existing);
            } catch {
              // ignore parse errors on existing history
            }
            history.push({
              status: newStatus,
              note,
              date: new Date().toISOString(),
            });

            updateLegalCase(caseId, {
              status: newStatus,
              status_history_json: JSON.stringify(history),
            });

            logAction("legal_case", caseId, "ai_mutation", { tool, params });
            applied.push(`Updated status to: ${newStatus}`);
            break;
          }

          default:
            errors.push(`Unknown tool: ${tool}`);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`${tool}: ${errMsg}`);
      }
    }

    return NextResponse.json({ applied, errors });
  } catch (error) {
    console.error("Error applying actions:", error);
    return NextResponse.json(
      { error: "Failed to apply actions" },
      { status: 500 }
    );
  }
}
