import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getGDriveStatus } from "@/lib/gdrive-imports";

export const runtime = "nodejs";

export async function GET() {
  await ensureDb();
  try {
    const status = getGDriveStatus();
    return NextResponse.json(status);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ available: false, error: message }, { status: 500 });
  }
}
