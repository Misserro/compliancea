import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getAllQaCards } from "@/lib/db-imports";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);

  await ensureDb();
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || null;
    const cards = getAllQaCards(status, orgId);
    return NextResponse.json({ cards });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
