import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { ensureDb } from "@/lib/server-utils";
import { createMigrationJob, getLatestMigrationJob, saveDb } from "@/lib/db-imports";
import { runMigration } from "@/lib/migration-worker";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();

  // Reject if a job is already running
  const latest = getLatestMigrationJob();
  if (latest && (latest.status === "running" || latest.status === "pending")) {
    return NextResponse.json(
      { error: "Migration already in progress" },
      { status: 409 }
    );
  }

  const jobId = createMigrationJob();
  saveDb();

  // Kick off migration asynchronously — don't block the response
  setImmediate(() => {
    runMigration(jobId).catch((err) => {
      console.error("Migration worker error:", err);
    });
  });

  return NextResponse.json({ jobId });
}
