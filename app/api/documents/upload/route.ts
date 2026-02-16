import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { ensureDb, saveUploadedFile } from "@/lib/server-utils";
import { getDocumentByPath, addDocument, getDocumentById } from "@/lib/db-imports";
import { DOCUMENTS_DIR } from "@/lib/paths-imports";

export const runtime = "nodejs";

const DEPARTMENTS = ["Finance", "Compliance", "Operations", "HR", "Board", "IT"];

export async function POST(request: NextRequest) {
  await ensureDb();
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Validate file type
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      return NextResponse.json({ error: "Only PDF and DOCX files are allowed" }, { status: 400 });
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File size exceeds 10MB limit" }, { status: 400 });
    }

    const folder = formData.get("folder") as string | null;
    const category = formData.get("category") as string | null;

    // Validate category if provided
    if (category && !DEPARTMENTS.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${DEPARTMENTS.join(", ")}` },
        { status: 400 }
      );
    }

    const destDir = folder ? path.join(DOCUMENTS_DIR, folder) : DOCUMENTS_DIR;
    const { filePath, fileName } = await saveUploadedFile(file, destDir);

    // Check if already in database
    const existing = getDocumentByPath(filePath);
    if (existing) {
      return NextResponse.json({ error: "Document already exists in library" }, { status: 409 });
    }

    // Add to database
    const documentId = addDocument(fileName, filePath, folder || null, category || null);
    const document = getDocumentById(documentId);

    return NextResponse.json({
      message: "Document uploaded successfully",
      document,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
