import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { revokeUserSessions } from "@/lib/db-imports";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (Number(id) === Number(session.user.id)) {
    return NextResponse.json({ error: "Cannot terminate your own session" }, { status: 400 });
  }

  await ensureDb();
  revokeUserSessions(Number(id));

  return NextResponse.json({ success: true });
}
