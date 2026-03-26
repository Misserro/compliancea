"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Database, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

interface MigrationStatus {
  id?: number;
  status: "none" | "pending" | "running" | "completed" | "failed";
  total?: number;
  migrated?: number;
  failed?: number;
  skipped?: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

interface OrgMigrationPanelProps {
  orgId: number;
  storagePolicy: string;
  platformConfigured: boolean;
  orgS3Configured: boolean;
}

export function OrgMigrationPanel({
  orgId,
  storagePolicy,
  platformConfigured,
  orgS3Configured,
}: OrgMigrationPanelProps) {
  const t = useTranslations("Admin.migrationPanel");
  const [expanded, setExpanded] = useState(false);
  const [job, setJob] = useState<MigrationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/migrations/storage/orgs/${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setJob(data);
        return data;
      }
    } catch {
      // ignore fetch errors during polling
    }
    return null;
  }, [orgId]);

  // Load on expand
  useEffect(() => {
    if (expanded) {
      setLoading(true);
      fetchStatus().then(() => setLoading(false));
    }
  }, [expanded, fetchStatus]);

  // Polling while running
  useEffect(() => {
    if (job && (job.status === "running" || job.status === "pending")) {
      intervalRef.current = setInterval(async () => {
        const data = await fetchStatus();
        if (data && data.status !== "running" && data.status !== "pending") {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      }, 2000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [job?.status, fetchStatus]);

  const handleTrigger = async (type: "local_to_platform_s3" | "own_s3_to_platform_s3") => {
    setTriggering(true);
    try {
      const res = await fetch(`/api/admin/migrations/storage/orgs/${orgId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (res.ok) {
        toast.success(t("migrationStarted"));
        await fetchStatus();
      } else {
        const data = await res.json();
        toast.error(data.error || t("failedToStartMigration"));
      }
    } catch {
      toast.error(t("failedToStartMigration"));
    } finally {
      setTriggering(false);
    }
  };

  const isRunning = job?.status === "running" || job?.status === "pending";
  const isCompleted = job?.status === "completed";
  const isFailed = job?.status === "failed";

  const total = job?.total ?? 0;
  const migrated = job?.migrated ?? 0;
  const failed = job?.failed ?? 0;
  const skipped = job?.skipped ?? 0;
  const processed = migrated + failed + skipped;
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

  const localDisabled = !platformConfigured || isRunning || triggering;
  const ownS3Disabled = !platformConfigured || !orgS3Configured || isRunning || triggering;

  return (
    <div className="border-t bg-muted/20">
      <button
        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <Database className="size-3.5" />
        {expanded ? t("hideMigration") : t("migrateFiles")}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("loading")}
            </div>
          ) : (
            <>
              {/* Migration buttons */}
              <div className="flex flex-wrap gap-2">
                {/* Local -> Platform S3 */}
                {!platformConfigured ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0}>
                          <Button size="sm" disabled className="pointer-events-none">
                            {t("migrateLocalToPlatformS3")}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("platformS3NotConfigured")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => handleTrigger("local_to_platform_s3")}
                    disabled={localDisabled}
                  >
                    {triggering || isRunning ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : null}
                    {t("migrateLocalToPlatformS3")}
                  </Button>
                )}

                {/* Own S3 -> Platform S3 (only for own_s3 policy) */}
                {storagePolicy === "own_s3" && (
                  <>
                    {!platformConfigured || !orgS3Configured ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span tabIndex={0}>
                              <Button size="sm" disabled className="pointer-events-none">
                                {t("migrateOwnS3ToPlatformS3")}
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              {!platformConfigured
                                ? t("platformS3NotConfigured")
                                : t("orgS3NotConfigured")}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTrigger("own_s3_to_platform_s3")}
                        disabled={ownS3Disabled}
                      >
                        {triggering || isRunning ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : null}
                        {t("migrateOwnS3ToPlatformS3")}
                      </Button>
                    )}
                  </>
                )}
              </div>

              {/* Progress display */}
              {isRunning && total > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{t("filesProcessed", { processed, total })}</span>
                    <span>{percent}%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span className="text-green-600">{t("migratedLabel", { count: migrated })}</span>
                    {failed > 0 && <span className="text-red-600">{t("failedLabel", { count: failed })}</span>}
                    {skipped > 0 && <span className="text-yellow-600">{t("skippedLabel", { count: skipped })}</span>}
                  </div>
                </div>
              )}

              {isRunning && total === 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("scanningFiles")}
                </div>
              )}

              {/* Completed summary */}
              {isCompleted && (
                <div className="rounded-md border p-3 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                    <CheckCircle2 className="h-4 w-4" />
                    {t("migrationComplete")}
                  </div>
                  <div className="text-sm text-muted-foreground space-y-0.5">
                    <p>{t("filesMigrated", { count: migrated })}</p>
                    {failed > 0 && (
                      <p className="text-red-600">{t("filesFailed", { count: failed })}</p>
                    )}
                    {skipped > 0 && (
                      <p className="text-yellow-600">{t("filesSkipped", { count: skipped })}</p>
                    )}
                    {total === 0 && <p>{t("noFilesToMigrate")}</p>}
                    {job?.completedAt && (
                      <p className="text-xs mt-1">
                        {t("completedAt", { date: new Date(job.completedAt).toLocaleString() })}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Failed summary */}
              {isFailed && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-red-700">
                    <XCircle className="h-4 w-4" />
                    {t("migrationFailed")}
                  </div>
                  {job?.error && (
                    <p className="text-sm text-red-600">{job.error}</p>
                  )}
                  <div className="text-sm text-muted-foreground">
                    <p>{t("migrationSummary", { migrated, failed, skipped, total })}</p>
                  </div>
                </div>
              )}

              {/* Warning about partial results */}
              {(isCompleted || isFailed) && failed > 0 && (
                <div className="flex items-start gap-2 text-xs text-yellow-700 bg-yellow-50 rounded p-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span>{t("retryHint")}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
