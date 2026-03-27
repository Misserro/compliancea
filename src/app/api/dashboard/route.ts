import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getAllDocuments,
  getAllObligations,
  getOverdueObligations,
  getUpcomingObligations,
  getContractsWithSummaries,
  getLegalHubDashboardData,
} from "@/lib/db-imports";
import { hasPermission, type PermissionLevel } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  const userId = Number(session.user.id);
  const orgRole = session.user.orgRole;
  const permissions = session.user.permissions as Record<string, string> | null;

  const canViewResource = (r: string): boolean =>
    !!session.user.isSuperAdmin
    || orgRole !== 'member'
    || hasPermission(((permissions ?? {})[r] ?? 'full') as PermissionLevel, 'view');

  await ensureDb();
  try {
    const result: Record<string, unknown> = {};

    // Documents section — gated by 'documents' permission
    if (canViewResource('documents')) {
      const docs = getAllDocuments(orgId) as Array<{ doc_type: string | null; processed: number }>;
      const byType: Record<string, number> = {};
      for (const d of docs) {
        const t = d.doc_type || "unknown";
        byType[t] = (byType[t] || 0) + 1;
      }
      result.docs = {
        total: docs.length,
        processed: docs.filter(d => d.processed).length,
        byType,
      };
    }

    // Obligations + Contracts section — gated by 'contracts' permission
    if (canViewResource('contracts')) {
      const allObligations = getAllObligations(orgId) as Array<{ status: string }>;
      const overdue = getOverdueObligations(orgId) as Array<{ id: number; title: string; due_date: string; document_name: string }>;
      const upcoming = getUpcomingObligations(30, orgId) as Array<{ id: number; title: string; due_date: string; document_name: string }>;
      const contracts = getContractsWithSummaries(orgId) as Array<{
        id: number; name: string; status: string; expiry_date: string | null;
        activeObligations: number | null;
      }>;

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

      result.obligations = {
        total: allObligations.length,
        active: allObligations.filter(o => o.status === "active").length,
        overdue: overdue.length,
        upcoming: upcoming.slice(0, 10),
      };
      result.contracts = {
        total: contracts.length,
        active: contracts.filter(c => c.status === "active" || ((c.activeObligations ?? 0) > 0)).length,
        expiringSoon,
      };
    }

    // Legal Hub section — gated by 'legal_hub' permission
    if (canViewResource('legal_hub')) {
      const legalHub = getLegalHubDashboardData(orgId, userId, orgRole);
      result.legalHub = legalHub;
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
