import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { ensureDb } from "@/lib/server-utils";
import { getLatestMigrationJob } from "@/lib/db-imports";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();

  const job = getLatestMigrationJob();

  if (!job) {
    return NextResponse.json({ status: "none" });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    total: job.total_files,
    migrated: job.migrated_files,
    failed: job.failed_files,
    skipped: job.skipped_files,
    error: job.error,
    startedAt: job.started_at,
    completedAt: job.completed_at,
  });
}
