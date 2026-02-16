import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { runMaintenanceCycle } from "@/lib/maintenance-imports";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  await ensureDb();
  try {
    const body = await request.json().catch(() => ({}));
    const force = body.force === true;
    const result = await runMaintenanceCycle({ force });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
