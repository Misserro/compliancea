import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { ensureDb } from "@/lib/server-utils";
import {
  createMigrationJobForOrg,
  getLatestMigrationJobForOrg,
  getOrgSettings,
  getPlatformSettings,
  saveDb,
} from "@/lib/db-imports";
import { runOrgMigration } from "@/lib/migration-worker";

export const runtime = "nodejs";

const VALID_TYPES = ["local_to_platform_s3", "own_s3_to_platform_s3"] as const;
type MigrationType = (typeof VALID_TYPES)[number];

function isPlatformS3Configured(): boolean {
  const rows = getPlatformSettings() as Array<{ key: string; value: string }>;
  const config = Object.fromEntries(rows.map((s) => [s.key, s.value]));
  return !!(config.s3Bucket && config.s3SecretEncrypted);
}

function isOrgS3Configured(orgId: number): boolean {
  const rows = getOrgSettings(orgId) as Array<{ key: string; value: string }>;
  const config = Object.fromEntries(rows.map((s) => [s.key, s.value]));
  return !!(config.s3Bucket && config.s3SecretEncrypted);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();

  const { orgId: orgIdStr } = await params;
  const orgId = parseInt(orgIdStr, 10);
  if (isNaN(orgId)) {
    return NextResponse.json({ error: "Invalid org ID" }, { status: 400 });
  }

  let body: { type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const type = body.type;
  if (!type || !VALID_TYPES.includes(type as MigrationType)) {
    return NextResponse.json(
      { error: "Invalid migration type. Must be 'local_to_platform_s3' or 'own_s3_to_platform_s3'" },
      { status: 400 }
    );
  }

  // Prerequisite: platform S3 must be configured for both types
  if (!isPlatformS3Configured()) {
    return NextResponse.json(
      { error: "Platform S3 is not configured" },
      { status: 400 }
    );
  }

  // Prerequisite: org S3 must be configured for own_s3_to_platform_s3
  if (type === "own_s3_to_platform_s3" && !isOrgS3Configured(orgId)) {
    return NextResponse.json(
      { error: "Org S3 credentials are not configured" },
      { status: 400 }
    );
  }

  // Reject if a job is already running/pending for this org
  const latest = getLatestMigrationJobForOrg(orgId) as {
    status: string;
  } | null;
  if (latest && (latest.status === "running" || latest.status === "pending")) {
    return NextResponse.json(
      { error: "Migration already in progress for this organization" },
      { status: 409 }
    );
  }

  const jobId = createMigrationJobForOrg(orgId, type as MigrationType);
  saveDb();

  // Kick off migration asynchronously
  setImmediate(() => {
    runOrgMigration(jobId, orgId, type as MigrationType).catch((err) => {
      console.error(`Org migration worker error (org ${orgId}):`, err);
    });
  });

  return NextResponse.json({ jobId });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();

  const { orgId: orgIdStr } = await params;
  const orgId = parseInt(orgIdStr, 10);
  if (isNaN(orgId)) {
    return NextResponse.json({ error: "Invalid org ID" }, { status: 400 });
  }

  const job = getLatestMigrationJobForOrg(orgId) as {
    id: number;
    status: string;
    total_files: number | null;
    migrated_files: number | null;
    failed_files: number | null;
    skipped_files: number | null;
    error: string | null;
    started_at: string | null;
    completed_at: string | null;
  } | null;

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
