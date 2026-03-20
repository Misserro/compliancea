import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getAllPolicies, getPolicyById, createPolicy } from "@/lib/policies-imports";

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
    const enabledOnly = searchParams.get("enabled") === "true";
    const policies = getAllPolicies(enabledOnly, orgId);
    return NextResponse.json({ policies });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);

  await ensureDb();
  try {
    const body = await request.json();
    const { name, condition, actionType, actionParams } = body;
    if (!name || !condition || !actionType) {
      return NextResponse.json(
        { error: "Missing required fields: name, condition, actionType" },
        { status: 400 }
      );
    }

    const id = createPolicy(name, condition, actionType, actionParams || {}, orgId, { userId: Number(session.user.id), orgId });
    const policy = getPolicyById(id);
    return NextResponse.json({ message: "Policy created", policy });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
