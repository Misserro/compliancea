import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { insertQaCard } from "@/lib/db-imports";
import { getEmbeddings, embeddingToBuffer } from "@/lib/embeddings-imports";
import { logAction } from "@/lib/audit-imports";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['documents'] ?? 'full';
    if (!hasPermission(perm as any, 'edit')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();

  try {
    const body = await request.json();
    const { items, sourceQuestionnaire } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items array is required" }, { status: 400 });
    }

    // Generate embeddings for all questions
    const questionTexts = items.map((item: { questionText: string }) => item.questionText);
    let embeddings: unknown[] = [];
    try {
      embeddings = await getEmbeddings(questionTexts);
    } catch (embErr: unknown) {
      const msg = embErr instanceof Error ? embErr.message : "Unknown error";
      console.warn("Failed to generate question embeddings:", msg);
      // Continue without embeddings
    }

    let saved = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const embedding = embeddings[i] ? embeddingToBuffer(embeddings[i] as number[]) : null;

      insertQaCard({
        questionText: item.questionText,
        approvedAnswer: item.approvedAnswer,
        evidenceJson: JSON.stringify(item.evidence || []),
        sourceQuestionnaire: sourceQuestionnaire || item.sourceQuestionnaire || null,
        questionEmbedding: embedding,
      orgId,
    });
      saved++;
    }

    logAction("qa_cards", null, "batch_approved", { saved, sourceQuestionnaire }, { userId: Number(session.user.id), orgId });

    return NextResponse.json({ saved, message: `${saved} Q&A card(s) saved successfully` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
