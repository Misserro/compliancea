import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getOrgMembers } from "@/lib/db-imports";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDb();
  try {
    const orgId = Number(session.user.orgId);
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 404 });
    }

    const members = getOrgMembers(orgId);

    return NextResponse.json({ members });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
