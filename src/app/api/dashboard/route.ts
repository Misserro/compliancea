import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import {
  getAllDocuments,
  getAllObligations,
  getOverdueObligations,
  getUpcomingObligations,
  getContractsWithSummaries,
  getProductFeatures,
} from "@/lib/db-imports";

export const runtime = "nodejs";

export async function GET() {
  await ensureDb();
  try {
    const docs = getAllDocuments() as Array<{ doc_type: string | null; processed: number }>;
    const allObligations = getAllObligations() as Array<{ status: string }>;
    const overdue = getOverdueObligations() as Array<{ id: number; title: string; due_date: string; document_name: string }>;
    const upcoming = getUpcomingObligations(30) as Array<{ id: number; title: string; due_date: string; document_name: string }>;
    const contracts = getContractsWithSummaries() as Array<{
      id: number; name: string; status: string; expiry_date: string | null;
      activeObligations: number;
    }>;
    const features = getProductFeatures() as Array<{ status: string }>;

    // Contracts expiring within 60 days
    const now = new Date();
    const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const expiringSoon = contracts
      .filter(c => c.expiry_date && new Date(c.expiry_date) <= in60Days && new Date(c.expiry_date) >= now)
      .map(c => ({
        id: c.id,
        name: c.name,
        expiry_date: c.expiry_date!,
        daysLeft: Math.ceil((new Date(c.expiry_date!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft);

    // Doc type breakdown
    const byType: Record<string, number> = {};
    for (const d of docs) {
      const t = d.doc_type || "unknown";
      byType[t] = (byType[t] || 0) + 1;
    }

    // Feature status breakdown
    const byStatus: Record<string, number> = {};
    for (const f of features) {
      byStatus[f.status] = (byStatus[f.status] || 0) + 1;
    }

    return NextResponse.json({
      docs: {
        total: docs.length,
        processed: docs.filter(d => d.processed).length,
        byType,
      },
      obligations: {
        total: allObligations.length,
        active: allObligations.filter(o => o.status === "active").length,
        overdue: overdue.length,
        upcoming: upcoming.slice(0, 10),
      },
      contracts: {
        total: contracts.length,
        active: contracts.filter(c => c.status === "active" || (c.activeObligations > 0)).length,
        expiringSoon,
      },
      features: {
        total: features.length,
        byStatus,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
