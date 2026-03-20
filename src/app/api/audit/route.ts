import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getAuditLog, getAuditLogCount } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);

  await ensureDb();
  try {
    const { searchParams } = new URL(request.url);

    const filters = {
      orgId,
      entityType: searchParams.get("entityType") || undefined,
      entityId: searchParams.get("entityId") ? parseInt(searchParams.get("entityId")!) : undefined,
      action: searchParams.get("action") || undefined,
      since: searchParams.get("since") || undefined,
      until: searchParams.get("until") || undefined,
      limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 100,
      offset: searchParams.get("offset") ? parseInt(searchParams.get("offset")!) : 0,
    };

    const entries = getAuditLog(filters);
    const total = getAuditLogCount(filters);

    return NextResponse.json({ entries, total, limit: filters.limit, offset: filters.offset });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
