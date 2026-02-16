import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getAllDocuments } from "@/lib/db-imports";

export const runtime = "nodejs";

export async function GET() {
  await ensureDb();
  try {
    const documents = getAllDocuments();
    return NextResponse.json({ documents });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
