import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getAllDocuments, getChunksByDocumentId, updateDocumentMetadata } from "@/lib/db-imports";
import { extractMetadata } from "@/lib/auto-tagger-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function POST() {
  await ensureDb();
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });
    }

    const docs = getAllDocuments().filter((d: { processed: number }) => d.processed);
    let retagged = 0;
    let failed = 0;
    const errors: { id: number; name: string; error: string }[] = [];

    for (const doc of docs) {
      try {
        // Reconstruct text from chunks or full_text
        let text = "";
        if (doc.full_text) {
          text = doc.full_text;
        } else {
          const chunks = getChunksByDocumentId(doc.id);
          if (!chunks || chunks.length === 0) continue;

          text = chunks
            .sort((a: { chunk_index: number }, b: { chunk_index: number }) => a.chunk_index - b.chunk_index)
            .map((c: { content: string }) => c.content)
            .join("\n");
        }

        const autoTagResult = await extractMetadata(text);

        const metadataUpdate: Record<string, unknown> = {
          doc_type: autoTagResult.doc_type,
          client: autoTagResult.client,
          jurisdiction: autoTagResult.jurisdiction,
          sensitivity: autoTagResult.sensitivity,
          language: autoTagResult.language,
          in_force: autoTagResult.in_force,
          auto_tags: JSON.stringify(autoTagResult.tags),
          tags: JSON.stringify(autoTagResult.tags),
          confirmed_tags: 0,
        };

        if (autoTagResult.category) {
          metadataUpdate.category = autoTagResult.category;
        }

        // Set contract-specific status
        const isContractType = autoTagResult.doc_type === "contract" || autoTagResult.doc_type === "agreement";
        if (isContractType && (!doc.status || doc.status === "draft")) {
          metadataUpdate.status = "unsigned";
        }

        const existingMeta = doc.metadata_json ? JSON.parse(doc.metadata_json) : {};
        if (autoTagResult.summary) existingMeta.summary = autoTagResult.summary;
        if (autoTagResult.structured_tags) existingMeta.structured_tags = autoTagResult.structured_tags;
        metadataUpdate.metadata_json = JSON.stringify(existingMeta);

        updateDocumentMetadata(doc.id, metadataUpdate);
        retagged++;

        console.log(`Retagged [${retagged}/${docs.length}]: ${doc.name} (${autoTagResult.tags.length} tags)`);
      } catch (tagErr: unknown) {
        failed++;
        const errMsg = tagErr instanceof Error ? tagErr.message : "Unknown error";
        errors.push({ id: doc.id, name: doc.name, error: errMsg });
        console.warn(`Retag failed for ${doc.name}:`, errMsg);
      }
    }

    logAction("system", null, "retag_all", { retagged, failed, total: docs.length });
    return NextResponse.json({ message: `Retagged ${retagged}/${docs.length} documents`, retagged, failed, errors });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
