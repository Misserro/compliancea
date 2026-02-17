import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getOpenTaskCount } from "@/lib/db-imports";
import { getLastRunTime } from "@/lib/maintenance-imports";
import { getGDriveStatus } from "@/lib/gdrive-imports";

export const runtime = "nodejs";

export async function GET() {
  await ensureDb();
  try {
    return NextResponse.json({
      lastRun: getLastRunTime(),
      openTasks: getOpenTaskCount(),
      gdriveStatus: getGDriveStatus(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
