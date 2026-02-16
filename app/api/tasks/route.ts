import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getAllTasks, getOpenTaskCount } from "@/lib/db-imports";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  await ensureDb();
  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status") || null;
    const tasks = getAllTasks(statusFilter);
    const openCount = getOpenTaskCount();
    return NextResponse.json({ tasks, openCount });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
