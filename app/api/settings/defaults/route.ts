import { NextResponse } from "next/server";
import { getDefaultSettings } from "@/lib/settings-imports";

export const runtime = "nodejs";

export async function GET() {
  try {
    const defaults = getDefaultSettings();
    return NextResponse.json({ defaults });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
