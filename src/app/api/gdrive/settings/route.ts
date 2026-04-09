import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getOrgSetting, setOrgSetting } from "@/lib/db-imports";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['documents'] ?? 'full';
    if (!hasPermission(perm as any, 'view')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();
  try {
    const credentialsJson = getOrgSetting(orgId, "gdrive_service_account") || "";
    const folderId = getOrgSetting(orgId, "gdrive_drive_id") || "";
    const historicalCutoff = getOrgSetting(orgId, "gdrive_historical_cutoff") || todayISO();
    const enabled = getOrgSetting(orgId, "gdrive_enabled") === "1";

    // Extract service account email for display (don't expose full credentials)
    let serviceAccountEmail = "";
    if (credentialsJson) {
      try {
        const creds = JSON.parse(credentialsJson);
        serviceAccountEmail = creds.client_email || "";
      } catch {
        // Invalid JSON
      }
    }

    return NextResponse.json({
      folderId,
      hasCredentials: !!credentialsJson,
      serviceAccountEmail,
      historicalCutoff,
      enabled,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['documents'] ?? 'full';
    if (!hasPermission(perm as any, 'edit')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();
  try {
    const body = await request.json();
    const { serviceAccountJson, folderId, historicalCutoff } = body;

    if (serviceAccountJson !== undefined) {
      // Validate JSON before saving
      if (serviceAccountJson.trim()) {
        try {
          const parsed = JSON.parse(serviceAccountJson);
          if (!parsed.client_email || !parsed.private_key) {
            return NextResponse.json(
              { error: "Invalid service account JSON: missing client_email or private_key fields." },
              { status: 400 }
            );
          }
        } catch {
          return NextResponse.json({ error: "Invalid JSON format." }, { status: 400 });
        }
      }
      setOrgSetting(orgId, "gdrive_service_account", serviceAccountJson.trim());
    }
    if (folderId !== undefined) {
      setOrgSetting(orgId, "gdrive_drive_id", folderId.trim());
    }
    if (historicalCutoff !== undefined) {
      if (historicalCutoff && !/^\d{4}-\d{2}-\d{2}$/.test(historicalCutoff)) {
        return NextResponse.json(
          { error: "Invalid historical cutoff date. Use YYYY-MM-DD format." },
          { status: 400 }
        );
      }
      setOrgSetting(orgId, "gdrive_historical_cutoff", historicalCutoff || "");
    }

    // Auto-set enabled flag when credentials + driveId are both provided
    const currentCreds = getOrgSetting(orgId, "gdrive_service_account") || "";
    const currentDriveId = getOrgSetting(orgId, "gdrive_drive_id") || "";
    const isEnabled = !!(currentCreds && currentDriveId);
    setOrgSetting(orgId, "gdrive_enabled", isEnabled ? "1" : "");

    // Return updated state
    let serviceAccountEmail = "";
    if (currentCreds) {
      try {
        serviceAccountEmail = JSON.parse(currentCreds).client_email || "";
      } catch {
        /* ignore */
      }
    }

    return NextResponse.json({
      folderId: currentDriveId,
      hasCredentials: !!currentCreds,
      serviceAccountEmail,
      historicalCutoff: getOrgSetting(orgId, "gdrive_historical_cutoff") || todayISO(),
      enabled: isEnabled,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
