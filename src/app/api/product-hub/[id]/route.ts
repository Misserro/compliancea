import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getProductFeature, updateProductFeature, deleteProductFeature } from "@/lib/db-imports";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await ensureDb();
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const feature = getProductFeature(numId);
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ feature });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  await ensureDb();
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const feature = getProductFeature(numId);
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  updateProductFeature(numId, body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await ensureDb();
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const feature = getProductFeature(numId);
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 });
  deleteProductFeature(numId);
  return NextResponse.json({ ok: true });
}
