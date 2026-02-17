import { NextResponse } from "next/server";
import { getUpcomingObligationsAllContracts } from "@/lib/db-imports";

/**
 * GET /api/contracts/upcoming
 * Get all obligations due in next 30 days across all contracts
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get("days");
    const days = daysParam ? parseInt(daysParam, 10) : 30;

    if (isNaN(days) || days < 1) {
      return NextResponse.json(
        { error: "Invalid days parameter" },
        { status: 400 }
      );
    }

    const obligations = await getUpcomingObligationsAllContracts(days);
    return NextResponse.json({ obligations });
  } catch (error) {
    console.error("Error fetching upcoming obligations:", error);
    return NextResponse.json(
      { error: "Failed to fetch upcoming obligations" },
      { status: 500 }
    );
  }
}
