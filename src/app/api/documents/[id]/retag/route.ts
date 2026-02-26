import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getDocumentById, getChunksByDocumentId, updateDocumentMetadata } from "@/lib/db-imports";
import { extractMetadata } from "@/lib/auto-tagger-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureDb();
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });
    }

    const { id } = await params;
    const docId = parseInt(id, 10);
    if (isNaN(docId)) {
      return NextResponse.json({ error: "Invalid document ID" }, { status: 400 });
    }

    const doc = getDocumentById(docId);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (!doc.processed) {
      return NextResponse.json({ error: "Document has not been processed yet" }, { status: 400 });
    }

    // Reconstruct text from full_text or chunks
    let text = "";
    if (doc.full_text) {
      text = doc.full_text;
    } else {
      const chunks = getChunksByDocumentId(docId);
      if (!chunks || chunks.length === 0) {
        return NextResponse.json({ error: "No text content found for this document" }, { status: 400 });
      }
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

    const isContractType = autoTagResult.doc_type === "contract" || autoTagResult.doc_type === "agreement";
    if (isContractType && (!doc.status || doc.status === "draft")) {
      metadataUpdate.status = "unsigned";
    }

    const existingMeta = doc.metadata_json ? JSON.parse(doc.metadata_json) : {};
    if (autoTagResult.summary) existingMeta.summary = autoTagResult.summary;
    if (autoTagResult.structured_tags) existingMeta.structured_tags = autoTagResult.structured_tags;
    metadataUpdate.metadata_json = JSON.stringify(existingMeta);

    updateDocumentMetadata(docId, metadataUpdate);

    logAction("system", docId, "retag_document", { tags: autoTagResult.tags.length });

    return NextResponse.json({
      message: `Retagged "${doc.name}" with ${autoTagResult.tags.length} tags`,
      tags: autoTagResult.tags.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
