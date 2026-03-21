"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function StorageMigration() {
  const [job, setJob] = useState<MigrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [s3Configured, setS3Configured] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/migrations/storage/status");
      if (res.ok) {
        const data = await res.json();
        setJob(data);
        return data;
      }
    } catch {
      // ignore fetch errors during polling
    }
    return null;
  }, []);

  const checkS3 = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/platform/storage");
      if (res.ok) {
        const data = await res.json();
        setS3Configured(data.configured === true);
      }
    } catch {
      // ignore
    }
  }, []);

  // Initial load
  useEffect(() => {
    Promise.all([fetchStatus(), checkS3()]).then(() => setLoading(false));
  }, [fetchStatus, checkS3]);

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

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      const res = await fetch("/api/admin/migrations/storage", { method: "POST" });
      if (res.ok) {
        toast.success("Migration started");
        await fetchStatus();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to start migration");
      }
    } catch {
      toast.error("Failed to start migration");
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Storage Migration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  const isRunning = job?.status === "running" || job?.status === "pending";
  const isCompleted = job?.status === "completed";
  const isFailed = job?.status === "failed";
  const buttonDisabled = !s3Configured || isRunning || triggering;

  const total = job?.total ?? 0;
  const migrated = job?.migrated ?? 0;
  const failed = job?.failed ?? 0;
  const skipped = job?.skipped ?? 0;
  const processed = migrated + failed + skipped;
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Storage Migration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Migrate existing local files to S3 storage. Local files are preserved (non-destructive copy).
        </p>

        {/* Trigger button */}
        <div>
          {!s3Configured ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button disabled className="pointer-events-none">
                      Migrate Data to S3
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>No S3 storage configured. Configure platform S3 or per-org S3 first.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Button onClick={handleTrigger} disabled={buttonDisabled}>
              {triggering || isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {triggering ? "Starting..." : "Migration in progress..."}
                </>
              ) : (
                "Migrate Data to S3"
              )}
            </Button>
          )}
        </div>

        {/* Progress display */}
        {isRunning && total > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{processed} of {total} files processed</span>
              <span>{percent}%</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="text-green-600">{migrated} migrated</span>
              {failed > 0 && <span className="text-red-600">{failed} failed</span>}
              {skipped > 0 && <span className="text-yellow-600">{skipped} skipped</span>}
            </div>
          </div>
        )}

        {isRunning && total === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Scanning files...
          </div>
        )}

        {/* Completed summary */}
        {isCompleted && (
          <div className="rounded-md border p-3 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              Migration Complete
            </div>
            <div className="text-sm text-muted-foreground space-y-0.5">
              <p>{migrated} file{migrated !== 1 ? "s" : ""} migrated to S3</p>
              {failed > 0 && (
                <p className="text-red-600">{failed} file{failed !== 1 ? "s" : ""} failed</p>
              )}
              {skipped > 0 && (
                <p className="text-yellow-600">{skipped} file{skipped !== 1 ? "s" : ""} skipped (no S3 configured for org)</p>
              )}
              {total === 0 && <p>No local files found to migrate.</p>}
              {job?.completedAt && (
                <p className="text-xs mt-1">
                  Completed at {new Date(job.completedAt).toLocaleString()}
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
              Migration Failed
            </div>
            {job?.error && (
              <p className="text-sm text-red-600">{job.error}</p>
            )}
            <div className="text-sm text-muted-foreground">
              <p>{migrated} migrated, {failed} failed, {skipped} skipped of {total} total</p>
            </div>
          </div>
        )}

        {/* Warning about partial results */}
        {(isCompleted || isFailed) && failed > 0 && (
          <div className="flex items-start gap-2 text-xs text-yellow-700 bg-yellow-50 rounded p-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>Some files failed to migrate. You can re-run the migration to retry failed files.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
