import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getContractsWithSummaries } from "@/lib/db-imports";

/**
 * GET /api/contracts
 * List all contracts with obligation summaries
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);

  await ensureDb();
  try {
    const contracts = await getContractsWithSummaries(orgId);
    return NextResponse.json({ contracts });
  } catch (error) {
    console.error("Error fetching contracts:", error);
    return NextResponse.json(
      { error: "Failed to fetch contracts" },
      { status: 500 }
    );
  }
}
