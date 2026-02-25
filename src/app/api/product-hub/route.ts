import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getProductFeatures, createProductFeature } from "@/lib/db-imports";

export const runtime = "nodejs";

export async function GET() {
  await ensureDb();
  try {
    const features = getProductFeatures();
    return NextResponse.json({ features });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  await ensureDb();
  try {
    const body = await req.json().catch(() => ({}));
    const feature = createProductFeature(body.title || 'Untitled Feature');
    return NextResponse.json(feature, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
