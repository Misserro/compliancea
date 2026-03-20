import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { runMaintenanceCycle } from "@/lib/maintenance-imports";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);

  await ensureDb();
  try {
    const body = await request.json().catch(() => ({}));
    const force = body.force === true;
    // Maintenance is intentionally a global operation (orphan cleanup, GDrive sync,
    // expired retention processing) -- not org-scoped. Auth ensures only logged-in users trigger it.
    const result = await runMaintenanceCycle({ force });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
