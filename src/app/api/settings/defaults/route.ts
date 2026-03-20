import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDefaultSettings } from "@/lib/settings-imports";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const defaults = getDefaultSettings();
    return NextResponse.json({ defaults });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
