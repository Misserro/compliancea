import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { resetSettings } from "@/lib/settings-imports";

export const runtime = "nodejs";

export async function POST() {
  await ensureDb();
  try {
    const settings = resetSettings();
    return NextResponse.json(settings);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
