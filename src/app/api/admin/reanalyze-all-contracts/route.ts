import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { ensureDb } from "@/lib/server-utils";
import {
  query,
  run,
  getChunksByDocumentId,
  insertObligation,
  getObligationById,
  createTaskForObligation,
} from "@/lib/db-imports";
import { extractContractTerms } from "@/lib/contracts-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

interface ContractRow {
  id: number;
  name: string;
  status: string;
  full_text: string | null;
  org_id: number;
}

interface ProcessDetail {
  documentId: number;
  name: string;
  status: "processed" | "failed" | "skipped";
  obligationsCreated?: number;
  tasksCreated?: number;
  error?: string;
}

/**
 * POST /api/admin/reanalyze-all-contracts
 * Re-extract obligations for all processed non-historical contracts in the org.
 * Super-admin only. Deletes existing non-system obligations before re-extracting.
 */
export async function POST() {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();

  const orgId = Number(session!.user.orgId);

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set." },
      { status: 500 }
    );
  }

  // Fetch all eligible contracts for the org
  const contracts = query(
    `SELECT id, name, status, full_text, org_id
     FROM documents
     WHERE org_id = ?
       AND doc_type IN ('contract', 'agreement')
       AND processed = 1
       AND is_historical = 0`,
    [orgId]
  ) as ContractRow[];

  let processed = 0;
  let failed = 0;
  let skipped = 0;
  const details: ProcessDetail[] = [];

  for (const contract of contracts) {
    try {
      // Reconstruct full text from full_text column or chunks
      let fullText = "";
      if (contract.full_text) {
        fullText = contract.full_text;
      } else {
        const chunks = getChunksByDocumentId(contract.id);
        if (!chunks || chunks.length === 0) {
          skipped++;
          details.push({
            documentId: contract.id,
            name: contract.name,
            status: "skipped",
            error: "No text content available",
          });
          continue;
        }
        fullText = chunks
          .map((c: { content: string }) => c.content)
          .join("\n\n");
      }

      // Delete all non-system obligations before re-extracting
      run(
        `DELETE FROM contract_obligations WHERE document_id = ? AND obligation_type NOT IN ('system_sign', 'system_terminate')`,
        [contract.id]
      );

      // Extract contract terms via Claude
      const result = await extractContractTerms(fullText);

      // Create obligation records (same logic as analyze-contract route)
      const createdObligations: unknown[] = [];
      let tasksCreated = 0;

      const statusToActiveStage: Record<string, string> = {
        unsigned: "not_signed",
        signed: "signed",
        active: "active",
        terminated: "terminated",
      };
      const currentActiveStage =
        statusToActiveStage[contract.status || "unsigned"] || "not_signed";

      for (const ob of result.obligations) {
        const shouldBeActive = ob.stage === currentActiveStage;
        const today = new Date().toISOString().split("T")[0];

        // For payment obligations with multiple due_dates, split into separate records
        if (ob.category === "payments" && ob.due_dates.length > 1) {
          const sortedDueDates = [...ob.due_dates].sort((a, b) =>
            (a.date || "").localeCompare(b.date || "")
          );
          const firstUpcomingIdx = sortedDueDates.findIndex(
            (dd) => dd.date && dd.date >= today
          );

          for (let i = 0; i < sortedDueDates.length; i++) {
            const dd = sortedDueDates[i];
            const isNextUpcoming = shouldBeActive && i === firstUpcomingIdx;
            const splitActivation = isNextUpcoming ? "active" : "inactive";
            const splitTitle = dd.label
              ? `${ob.title} — ${dd.label}`
              : `${ob.title} — ${dd.date || "N/A"}`;

            const splitDetailsJson = JSON.stringify({
              due_dates: [dd],
              key_values: ob.key_values,
              clause_references: ob.clause_references,
            });

            const obligationId = insertObligation({
              documentId: contract.id,
              obligationType: ob.category,
              title: splitTitle,
              description: ob.summary,
              clauseReference: ob.clause_references.join(", ") || null,
              dueDate: dd.date || null,
              recurrence: ob.recurrence,
              noticePeriodDays: ob.notice_period_days,
              owner: ob.suggested_owner,
              escalationTo: null,
              proofDescription: ob.proof_description,
              evidenceJson: "[]",
              category: ob.category,
              activation: splitActivation,
              summary: ob.summary,
              detailsJson: splitDetailsJson,
              penalties: ob.penalties,
              stage: ob.stage,
              orgId,
            });

            const created = getObligationById(obligationId);
            createdObligations.push(created);

            if (splitActivation === "active" && dd.date) {
              createTaskForObligation(obligationId, {
                title: `${dd.label || ob.title}${dd.amount ? ` — ${dd.amount}` : ""} — ${contract.name}`,
                description: dd.details || ob.summary,
                dueDate: dd.date,
                owner: ob.suggested_owner,
                escalationTo: null,
                orgId,
              });
              tasksCreated++;
            }
          }
        } else {
          // Non-payment obligations or single due_date: create as single record
          const firstDueDate =
            ob.due_dates.length > 0 ? ob.due_dates[0].date : null;
          const detailsJson = JSON.stringify({
            due_dates: ob.due_dates,
            key_values: ob.key_values,
            clause_references: ob.clause_references,
          });

          const activation = shouldBeActive ? "active" : "inactive";

          const obligationId = insertObligation({
            documentId: contract.id,
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
            activation,
            summary: ob.summary,
            detailsJson,
            penalties: ob.penalties,
            stage: ob.stage,
            orgId,
          });

          const created = getObligationById(obligationId);
          createdObligations.push(created);

          if (activation === "active" && ob.due_dates.length > 0) {
            for (const dd of ob.due_dates) {
              if (dd.date) {
                createTaskForObligation(obligationId, {
                  title: `${dd.label || ob.title}${dd.amount ? ` — ${dd.amount}` : ""} — ${contract.name}`,
                  description: dd.details || ob.summary,
                  dueDate: dd.date,
                  owner: ob.suggested_owner,
                  escalationTo: null,
                  orgId,
                });
                tasksCreated++;
              }
            }
          }
        }
      }

      logAction(
        "document",
        contract.id,
        "contract_reanalyzed",
        {
          obligationsCount: createdObligations.length,
          tasksCreated,
          batch: true,
        },
        { userId: Number(session!.user.id), orgId }
      );

      processed++;
      details.push({
        documentId: contract.id,
        name: contract.name,
        status: "processed",
        obligationsCreated: createdObligations.length,
        tasksCreated,
      });
    } catch (err) {
      failed++;
      details.push({
        documentId: contract.id,
        name: contract.name,
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    processed,
    failed,
    skipped,
    total: contracts.length,
    details,
  });
}
