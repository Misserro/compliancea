import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getTokenUsageSummary } from "@/lib/db-imports";
import { formatNumber, formatCost } from "@/lib/utils";

interface TokenUsageRow {
  userId: number;
  userName: string | null;
  userEmail: string;
  orgId: number;
  orgName: string;
  claudeInputTokens: number;
  claudeOutputTokens: number;
  voyageTokens: number;
  estimatedCostUsd: number;
}

export default async function TokenUsagePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.isSuperAdmin) redirect("/");

  await ensureDb();
  const usage = getTokenUsageSummary() as TokenUsageRow[];

  const totals = usage.reduce(
    (acc, row) => ({
      claudeInputTokens: acc.claudeInputTokens + (row.claudeInputTokens ?? 0),
      claudeOutputTokens: acc.claudeOutputTokens + (row.claudeOutputTokens ?? 0),
      voyageTokens: acc.voyageTokens + (row.voyageTokens ?? 0),
      estimatedCostUsd: acc.estimatedCostUsd + (row.estimatedCostUsd ?? 0),
    }),
    { claudeInputTokens: 0, claudeOutputTokens: 0, voyageTokens: 0, estimatedCostUsd: 0 }
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Token Usage</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Aggregated AI token consumption and estimated costs across all users.
        </p>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">User</th>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Organization</th>
              <th className="text-right px-4 py-3 font-medium">Claude Input Tokens</th>
              <th className="text-right px-4 py-3 font-medium">Claude Output Tokens</th>
              <th className="text-right px-4 py-3 font-medium">Voyage Tokens</th>
              <th className="text-right px-4 py-3 font-medium">Est. Cost (USD)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {usage.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No token usage data recorded yet.
                </td>
              </tr>
            ) : (
              <>
                {usage.map((row) => (
                  <tr key={`${row.userId}-${row.orgId}`} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      {row.userName || <span className="text-muted-foreground">No name</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.userEmail}</td>
                    <td className="px-4 py-3">{row.orgName}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.claudeInputTokens)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.claudeOutputTokens)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.voyageTokens)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{formatCost(row.estimatedCostUsd)}</td>
                  </tr>
                ))}
                <tr className="bg-muted/50 font-semibold">
                  <td className="px-4 py-3" colSpan={3}>Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(totals.claudeInputTokens)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(totals.claudeOutputTokens)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(totals.voyageTokens)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCost(totals.estimatedCostUsd)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
