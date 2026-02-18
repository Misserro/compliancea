import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getPolicyById, updatePolicy, deletePolicy } from "@/lib/policies-imports";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const policyId = parseInt(id, 10);

  try {
    const policy = getPolicyById(policyId);
    if (!policy) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }

    const body = await request.json();
    updatePolicy(policyId, body);
    const updated = getPolicyById(policyId);
    return NextResponse.json({ message: "Policy updated", policy: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const policyId = parseInt(id, 10);

  try {
    const deleted = deletePolicy(policyId);
    if (!deleted) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }
    return NextResponse.json({ message: "Policy deleted" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
