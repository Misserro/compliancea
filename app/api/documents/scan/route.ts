import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { ensureDb, guessType } from "@/lib/server-utils";
import { getAllDocuments, getDocumentByPath, addDocument } from "@/lib/db-imports";
import { DOCUMENTS_DIR } from "@/lib/paths-imports";

export const runtime = "nodejs";

export async function POST() {
  await ensureDb();
  try {
    const files = await fs.readdir(DOCUMENTS_DIR);
    let added = 0;
    let skipped = 0;

    for (const file of files) {
      // Skip hidden files and .gitkeep
      if (file.startsWith(".")) continue;

      const filePath = path.join(DOCUMENTS_DIR, file);
      const stat = await fs.stat(filePath);

      // Skip directories
      if (stat.isDirectory()) continue;

      // Check file type
      const fileType = guessType(file);
      if (!fileType) {
        skipped++;
        continue;
      }

      // Check if already in database
      const existing = getDocumentByPath(filePath);
      if (existing) {
        skipped++;
        continue;
      }

      // Add to database
      addDocument(file, filePath, null);
      added++;
    }

    const documents = getAllDocuments();
    return NextResponse.json({
      message: `Scan complete. Added ${added} new document(s), skipped ${skipped}.`,
      added,
      skipped,
      documents,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
