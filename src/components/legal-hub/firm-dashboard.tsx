"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FirmStatsPanel } from "./firm-stats-panel";
import { MemberRoster, type FirmMember } from "./member-roster";

interface FirmStats {
  statsByStatus: { status: string; count: number }[];
  finalizedLast30Days: number;
  members: FirmMember[];
}

export function FirmDashboard() {
  const { data: sessionData, status } = useSession();
  const router = useRouter();
  const t = useTranslations('LegalHub');
  const isAdmin = sessionData?.user?.orgRole !== "member";

  const [firmStats, setFirmStats] = useState<FirmStats | null>(null);
  const [firmStatsLoading, setFirmStatsLoading] = useState(true);

  const fetchFirmStats = useCallback(async () => {
    setFirmStatsLoading(true);
    try {
      const res = await fetch("/api/legal-hub/firm-stats");
      if (res.ok) {
        const data: FirmStats = await res.json();
        setFirmStats(data);
      }
    } catch {
      // Silently fail — stats panel will show loading state
    } finally {
      setFirmStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!isAdmin) {
      router.replace("/legal/cases");
      return;
    }
    fetchFirmStats();
  }, [status, isAdmin, fetchFirmStats, router]);

  if (status === "loading" || !isAdmin) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{t('firmDashboard.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('firmDashboard.subtitle')}
        </p>
      </div>
      <FirmStatsPanel
        statsByStatus={firmStats?.statsByStatus ?? []}
        finalizedLast30Days={firmStats?.finalizedLast30Days ?? 0}
        loading={firmStatsLoading}
      />
      <MemberRoster
        members={firmStats?.members ?? []}
        onProfileUpdated={fetchFirmStats}
      />
    </div>
  );
}
