import { NextResponse } from "next/server";
import { checkEmbeddingStatus } from "@/lib/embeddings-imports";

export const runtime = "nodejs";

export async function GET() {
  try {
    const status = await checkEmbeddingStatus();
    return NextResponse.json(status);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ available: false, error: message }, { status: 500 });
  }
}
