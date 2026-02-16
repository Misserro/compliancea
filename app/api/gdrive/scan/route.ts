import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getAllDocuments } from "@/lib/db-imports";
import { scanGDrive, getGDriveStatus } from "@/lib/gdrive-imports";

export const runtime = "nodejs";

export async function POST() {
  await ensureDb();
  try {
    const status = getGDriveStatus();
    if (!status.available) {
      return NextResponse.json(
        { error: status.error || "Google Drive not configured" },
        { status: 503 }
      );
    }

    const result = await scanGDrive();
    const documents = getAllDocuments();

    let message = `Google Drive scan complete. Added: ${result.added}, Updated: ${result.updated}, Removed: ${result.deleted}, Unchanged: ${result.unchanged}`;
    if (result.errors && result.errors.length > 0) {
      message += ` | Errors: ${result.errors.join("; ")}`;
    }

    return NextResponse.json({
      message,
      ...result,
      documents,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Google Drive scan failed: ${errMsg}` }, { status: 500 });
  }
}
