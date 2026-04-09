import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import Anthropic from "@anthropic-ai/sdk";
import {
  getContractsWithSummaries,
  getDocumentById,
  updateContractMetadata,
} from "@/lib/db-imports";
import { CONTRACT_TYPES } from "@/lib/constants";

export const runtime = "nodejs";

const VALID_TYPES = CONTRACT_TYPES.map((t) => t.value);

/**
 * POST /api/admin/backfill-contract-types
 * Retroactively name and classify existing contracts.
 * Auth: superAdmin or orgAdmin (owner/admin role) only.
 */
export async function POST() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isSuperAdmin = !!session.user.isSuperAdmin;
  const orgRole = session.user.orgRole;
  const isOrgAdmin = orgRole === "owner" || orgRole === "admin";

  if (!isSuperAdmin && !isOrgAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = Number(session.user.orgId);

  try {
    await ensureDb();
    const contracts = await getContractsWithSummaries(orgId);

    const results = { processed: 0, named: 0, classified: 0, skipped: 0 };

    const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    for (const contract of contracts) {
      // Skip contracts already named (contains em dash " — ", U+2014) AND already classified
      const hasEmDashName =
        contract.name && contract.name.includes(" \u2014 ");
      if (hasEmDashName && contract.contract_type) {
        results.skipped++;
        continue;
      }

      results.processed++;

      // Fetch full document for full_text and metadata_json
      const doc = await getDocumentById(contract.id, orgId);
      if (!doc) continue;

      // --- Derive name from DB fields (no LLM) ---
      let derivedName: string | null = null;

      if (doc.contracting_company && doc.contracting_vendor) {
        derivedName = `${doc.contracting_company} \u2014 ${doc.contracting_vendor}`;
      } else if (doc.contracting_company) {
        derivedName = doc.contracting_company;
      } else if (doc.contracting_vendor) {
        derivedName = doc.contracting_vendor;
      } else {
        // Try metadata_json.parties
        try {
          if (doc.metadata_json) {
            const meta = JSON.parse(doc.metadata_json);
            if (Array.isArray(meta.parties) && meta.parties.length > 0) {
              if (meta.parties.length >= 2) {
                derivedName = `${meta.parties[0]} \u2014 ${meta.parties[1]}`;
              } else {
                derivedName = meta.parties[0];
              }
            }
          }
        } catch {
          // metadata_json parse failed — skip name derivation
        }
      }

      // --- Classify via lightweight Claude call ---
      let classifiedType: string | null = null;
      let suggestedName: string | null = null;

      if (doc.full_text && !contract.contract_type) {
        const words = doc.full_text.split(/\s+/);
        const truncated = words.slice(0, 3000).join(" ");

        try {
          const response = await anthropic.messages.create({
            model,
            max_tokens: 200,
            messages: [
              {
                role: "user",
                content: `Classify this contract. Return only JSON: {"contract_type": "vendor|b2b|employment|nda|lease|licensing|partnership|framework|other", "suggested_name": "CompanyA — CompanyB"}\n\n${truncated}`,
              },
            ],
          });

          const responseText = response.content[0]?.type === "text" ? response.content[0].text : "";
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.contract_type && VALID_TYPES.includes(parsed.contract_type)) {
              classifiedType = parsed.contract_type;
            }
            if (parsed.suggested_name && typeof parsed.suggested_name === "string") {
              suggestedName = parsed.suggested_name;
            }
          }
        } catch {
          // Claude call failed for this contract — skip classification
        }
      }

      // --- Build update payload ---
      const updates: Record<string, string> = {};

      // Name: use derived name; fall back to Claude's suggested_name if we couldn't derive
      if (!hasEmDashName) {
        const newName = derivedName || suggestedName;
        if (newName) {
          updates.name = newName;
          results.named++;
        }
      }

      // Type: use Claude classification
      if (!contract.contract_type && classifiedType) {
        updates.contract_type = classifiedType;
        results.classified++;
      }

      if (Object.keys(updates).length > 0) {
        await updateContractMetadata(contract.id, updates);
      }
    }

    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    console.error("Backfill error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Backfill failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
