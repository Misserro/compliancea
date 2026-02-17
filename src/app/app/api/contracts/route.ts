import { NextResponse } from "next/server";
import { getContractsWithSummaries } from "@/lib/db-imports";

/**
 * GET /api/contracts
 * List all contracts with obligation summaries
 */
export async function GET() {
  try {
    const contracts = await getContractsWithSummaries();
    return NextResponse.json({ contracts });
  } catch (error) {
    console.error("Error fetching contracts:", error);
    return NextResponse.json(
      { error: "Failed to fetch contracts" },
      { status: 500 }
    );
  }
}
