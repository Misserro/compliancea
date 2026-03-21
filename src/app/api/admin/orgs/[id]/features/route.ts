import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { getOrgFeatures, setOrgFeature, getOrgById } from "@/lib/db-imports";
import { FEATURES } from "@/lib/feature-flags";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();
  const { id } = await params;
  const orgId = parseInt(id, 10);
  if (isNaN(orgId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const org = getOrgById(orgId);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const rows = getOrgFeatures(orgId) as { feature: string; enabled: number }[];
  const rowMap = Object.fromEntries(rows.map((r) => [r.feature, !!r.enabled]));

  // Opt-out model: absent row = enabled
  const result = Object.fromEntries(
    FEATURES.map((f) => [f, rowMap[f] ?? true])
  );
  return NextResponse.json(result);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();
  const { id } = await params;
  const orgId = parseInt(id, 10);
  if (isNaN(orgId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const org = getOrgById(orgId);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const featuresSet = new Set<string>(FEATURES);
  for (const [feature, enabled] of Object.entries(body)) {
    if (featuresSet.has(feature) && typeof enabled === "boolean") {
      setOrgFeature(orgId, feature, enabled);
    }
  }

  // Return updated state
  const rows = getOrgFeatures(orgId) as { feature: string; enabled: number }[];
  const rowMap = Object.fromEntries(rows.map((r) => [r.feature, !!r.enabled]));
  const result = Object.fromEntries(
    FEATURES.map((f) => [f, rowMap[f] ?? true])
  );
  return NextResponse.json(result);
}
