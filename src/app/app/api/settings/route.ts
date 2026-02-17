import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getSettings, updateSettings } from "@/lib/settings-imports";

export const runtime = "nodejs";

export async function GET() {
  await ensureDb();
  try {
    const settings = getSettings();
    return NextResponse.json(settings);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  await ensureDb();
  try {
    const updates = await request.json();
    const settings = updateSettings(updates);
    return NextResponse.json(settings);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
