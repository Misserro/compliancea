import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getAllQaCards } from "@/lib/db-imports";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  await ensureDb();
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || null;
    const cards = getAllQaCards(status);
    return NextResponse.json({ cards });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
