import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getPendingReplacements } from "@/lib/db-imports";

export const runtime = "nodejs";

export async function GET() {
  await ensureDb();
  try {
    const pending = getPendingReplacements();
    return NextResponse.json({ pending });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
