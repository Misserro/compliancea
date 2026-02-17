import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { ensureDb } from "@/lib/server-utils";
import { getDocumentById } from "@/lib/db-imports";
import { DOCUMENTS_DIR } from "@/lib/paths-imports";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const documentId = parseInt(id, 10);

  try {
    const document = getDocumentById(documentId);
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Security: verify path is within DOCUMENTS_DIR
    const resolvedPath = path.resolve(document.path);
    const resolvedDocsDir = path.resolve(DOCUMENTS_DIR);
    if (!resolvedPath.startsWith(resolvedDocsDir)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Verify file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      return NextResponse.json({ error: "Document file not found on disk" }, { status: 404 });
    }

    // Read file
    const fileBuffer = await fs.readFile(resolvedPath);

    // Determine MIME type
    const ext = path.extname(resolvedPath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".pdf": "application/pdf",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".doc": "application/msword",
      ".txt": "text/plain",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    // Set headers for inline display or download
    const { searchParams } = new URL(request.url);
    const disposition = searchParams.get("download") === "true" ? "attachment" : "inline";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(document.name)}"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
