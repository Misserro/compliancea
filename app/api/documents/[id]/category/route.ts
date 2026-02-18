import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getDocumentById, updateDocumentCategory } from "@/lib/db-imports";

export const runtime = "nodejs";

const DEPARTMENTS = ["Finance", "Compliance", "Operations", "HR", "Board", "IT"];

export async function PATCH(
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

    const body = await request.json();
    const { category } = body;

    // Validate category is one of the allowed departments or null
    const validCategories = [...DEPARTMENTS, null, ""];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${DEPARTMENTS.join(", ")}` },
        { status: 400 }
      );
    }

    updateDocumentCategory(documentId, category || null);

    const updatedDocument = getDocumentById(documentId);
    return NextResponse.json({
      message: "Category updated successfully",
      document: updatedDocument,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
