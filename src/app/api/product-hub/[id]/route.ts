import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getProductFeature, updateProductFeature, deleteProductFeature } from "@/lib/db-imports";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await ensureDb();
  const { id } = await params;
  const feature = getProductFeature(Number(id));
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ feature });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  await ensureDb();
  const { id } = await params;
  const feature = getProductFeature(Number(id));
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  updateProductFeature(Number(id), body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await ensureDb();
  const { id } = await params;
  const feature = getProductFeature(Number(id));
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 });
  deleteProductFeature(Number(id));
  return NextResponse.json({ ok: true });
}
