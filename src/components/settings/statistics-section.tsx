"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PRICING } from "@/lib/constants";
import { formatNumber, formatCost } from "@/lib/utils";

export function StatisticsSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Usage & Costs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Token usage is tracked per action. Cost estimates are based on public API pricing.
        </p>

        <Separator />

        <div>
          <h4 className="text-sm font-medium mb-3">Pricing Reference</h4>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="text-left px-3 py-2 font-medium">Model</th>
                  <th className="text-left px-3 py-2 font-medium">Input</th>
                  <th className="text-left px-3 py-2 font-medium">Output</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="px-3 py-2">Claude (Sonnet)</td>
                  <td className="px-3 py-2">${PRICING.claude.sonnet.input.toFixed(2)} / 1M tokens</td>
                  <td className="px-3 py-2">${PRICING.claude.sonnet.output.toFixed(2)} / 1M tokens</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2">Claude (Haiku)</td>
                  <td className="px-3 py-2">${PRICING.claude.haiku.input.toFixed(2)} / 1M tokens</td>
                  <td className="px-3 py-2">${PRICING.claude.haiku.output.toFixed(2)} / 1M tokens</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2">Voyage AI (voyage-3-lite)</td>
                  <td className="px-3 py-2" colSpan={2}>
                    ${PRICING.voyage.toFixed(2)} / 1M tokens
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
