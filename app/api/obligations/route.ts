import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getAllObligations, getOverdueObligations, getUpcomingObligations } from "@/lib/db-imports";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  await ensureDb();
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "active"; // active | finalized | all

    const allObligations = getAllObligations();
    const overdue = getOverdueObligations();
    const upcoming = getUpcomingObligations(30);

    let obligations;
    if (filter === "active") {
      obligations = allObligations.filter((o: { status: string }) => o.status === "active");
    } else if (filter === "finalized") {
      obligations = allObligations.filter((o: { status: string }) => o.status === "finalized");
    } else {
      obligations = allObligations;
    }

    return NextResponse.json({
      obligations,
      stats: {
        total: allObligations.length,
        active: allObligations.filter((o: { status: string }) => o.status === "active").length,
        finalized: allObligations.filter((o: { status: string }) => o.status === "finalized").length,
        met: allObligations.filter((o: { status: string }) => o.status === "met").length,
        overdue: overdue.length,
        upcoming: upcoming.length,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
