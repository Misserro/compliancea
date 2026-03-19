/**
 * Direct document ingestion for case attachments.
 * Called server-side after upload — avoids HTTP self-fetch.
 * Handles text extraction, page-aware chunking, and embedding storage.
 */

export const runtime = "nodejs";

import fs from "fs/promises";
import pdfParse from "pdf-parse";
import { ensureDb, extractTextFromPath, guessType } from "@/lib/server-utils";
import {
  getDocumentById,
  updateDocumentProcessed,
  deleteChunksByDocumentId,
  insertChunkWithMeta,
  setDocumentProcessingError,
} from "@/lib/db-imports";
import { chunkText, chunkTextByPages } from "@/lib/chunker-imports";
import {
  getEmbedding,
  embeddingToBuffer,
  checkEmbeddingStatus,
} from "@/lib/embeddings-imports";

export async function ingestCaseDocument(documentId: number): Promise<void> {
  await ensureDb();

  const document = getDocumentById(documentId);
  if (!document) {
    throw new Error("Document not found");
  }

  // Verify file exists
  try {
    await fs.access(document.path);
  } catch {
    throw new Error("Document file not found on disk");
  }

  // Skip if already processed with content present
  if (document.processed === 1) {
    return;
  }

  // Check embedding service availability
  const embeddingStatus = await checkEmbeddingStatus();
  if (!embeddingStatus.available) {
    throw new Error(embeddingStatus.error || "Embedding service unavailable");
  }

  // Extract text
  const text = await extractTextFromPath(document.path);
  if (!text || text.trim().length === 0) {
    throw new Error("Could not extract text — the file may be a scanned image or empty");
  }

  // Delete any stale chunks from a previous partial run
  deleteChunksByDocumentId(documentId);

  const fileType = guessType(document.name as string);
  let wordCount = 0;

  if (fileType === "pdf") {
    const fileBuffer = await fs.readFile(document.path);
    const pdfData = await pdfParse(fileBuffer);
    const pageTexts = (pdfData.text as string)
      .split("\f")
      .filter((t: string) => t.trim().length > 0);
    const pages = pageTexts.map((t: string, i: number) => ({
      pageNumber: i + 1,
      text: t,
    }));

    const chunks = chunkTextByPages(pages);
    if (chunks.length === 0) {
      throw new Error("Document produced no chunks — it may contain only images");
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await getEmbedding(chunk.content as string);
      insertChunkWithMeta({
        documentId,
        content: chunk.content,
        chunkIndex: i,
        embedding: embeddingToBuffer(embedding),
        pageNumber: chunk.pageNumber,
        charOffsetStart: chunk.charOffsetStart,
        charOffsetEnd: chunk.charOffsetEnd,
        sectionTitle: chunk.sectionTitle,
        sentencesJson: JSON.stringify(chunk.sentences),
      });
      wordCount += (chunk.content as string).split(/\s+/).length;
    }
  } else {
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      throw new Error("Document produced no chunks");
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await getEmbedding(chunk.content as string);
      insertChunkWithMeta({
        documentId,
        content: chunk.content,
        chunkIndex: i,
        embedding: embeddingToBuffer(embedding),
        pageNumber: null,
        charOffsetStart: null,
        charOffsetEnd: null,
        sectionTitle: null,
        sentencesJson: null,
      });
      wordCount += (chunk.content as string).split(/\s+/).length;
    }
  }

  updateDocumentProcessed(documentId, wordCount);
}

/**
 * Wrapper that records any error to the document record
 * so the status endpoint can surface it to the UI.
 */
export async function ingestCaseDocumentSafe(documentId: number): Promise<void> {
  try {
    await ingestCaseDocument(documentId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    setDocumentProcessingError(documentId, message);
    console.error(`[ingest] document ${documentId} failed:`, message);
  }
}
