"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { HardDrive, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface PlatformStorageConfig {
  configured: boolean;
  bucket?: string;
  region?: string;
  accessKeyId?: string;
  secretKey?: string;
  endpoint?: string;
}

export function PlatformStorageConfig() {
  const t = useTranslations("Admin.platformStorage");
  const [config, setConfig] = useState<PlatformStorageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  const [bucket, setBucket] = useState("");
  const [region, setRegion] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [endpoint, setEndpoint] = useState("");

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/platform/storage");
      if (res.ok) {
        const data: PlatformStorageConfig = await res.json();
        setConfig(data);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  function handleEdit() {
    if (config?.configured) {
      setBucket(config.bucket || "");
      setRegion(config.region || "");
      setAccessKeyId(config.accessKeyId || "");
      setSecretKey("");
      setEndpoint(config.endpoint || "");
    }
    setError("");
    setTestResult(null);
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
    setError("");
    setTestResult(null);
    setBucket("");
    setRegion("");
    setAccessKeyId("");
    setSecretKey("");
    setEndpoint("");
  }

  function getFormBody(): Record<string, string> | null {
    const trimmedBucket = bucket.trim();
    const trimmedRegion = region.trim();
    const trimmedAccessKeyId = accessKeyId.trim();
    const trimmedSecretKey = secretKey.trim();
    const trimmedEndpoint = endpoint.trim();

    if (!trimmedBucket || !trimmedRegion || !trimmedAccessKeyId || !trimmedSecretKey) {
      setError(t("allFieldsRequired"));
      return null;
    }

    const body: Record<string, string> = {
      bucket: trimmedBucket,
      region: trimmedRegion,
      accessKeyId: trimmedAccessKeyId,
      secretKey: trimmedSecretKey,
    };
    if (trimmedEndpoint) {
      body.endpoint = trimmedEndpoint;
    }
    return body;
  }

  async function handleTest() {
    const body = getFormBody();
    if (!body) return;

    setTesting(true);
    setError("");
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/platform/storage/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        toast.success(t("connectionTestSuccessful"));
      } else {
        toast.error(data.error || t("connectionTestFailed"));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setTestResult({ success: false, error: msg });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    const body = getFormBody();
    if (!body) return;

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/platform/storage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(t("configSaved"));
        setEditing(false);
        setBucket("");
        setRegion("");
        setAccessKeyId("");
        setSecretKey("");
        setEndpoint("");
        setTestResult(null);
        await loadConfig();
      } else {
        const data = await res.json();
        const msg = data.error || t("failedToSaveConfig");
        setError(msg);
        toast.error(msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      const res = await fetch("/api/admin/platform/storage", {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        setConfig({ configured: false });
        setEditing(false);
        setBucket("");
        setRegion("");
        setAccessKeyId("");
        setSecretKey("");
        setEndpoint("");
        toast.success(t("configRemoved"));
      } else {
        const data = await res.json();
        toast.error(data.error || t("failedToRemoveConfig"));
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRemoving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HardDrive className="size-4" />
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-48" />
            <div className="h-10 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const isConfigured = config?.configured === true;
  const showForm = !isConfigured || editing;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <HardDrive className="size-4" />
          Platform Storage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConfigured && !editing && (
          <>
            <p className="text-sm text-muted-foreground">
              {t("configuredDesc")}
            </p>
            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("bucket")}</span>
                <span className="font-medium">{config.bucket}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("region")}</span>
                <span className="font-medium">{config.region}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("accessKeyId")}</span>
                <span className="font-medium">{config.accessKeyId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("secretAccessKey")}</span>
                <span className="font-medium">*****</span>
              </div>
              {config.endpoint && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("endpoint")}</span>
                  <span className="font-medium">{config.endpoint}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleEdit}>
                {t("edit")}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={removing}
                  >
                    {removing && <Loader2 className="size-4 animate-spin" />}
                    {t("removeConfiguration")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("removeConfirmTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("removeConfirmDesc")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRemove}
                      className="bg-destructive text-white hover:bg-destructive/90"
                    >
                      {t("remove")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}

        {showForm && (
          <div className="space-y-4">
            {!isConfigured && (
              <p className="text-sm text-muted-foreground">
                {t("configureDesc")}
              </p>
            )}

            <div>
              <Label htmlFor="platform-s3-bucket">{t("bucketNameLabel")}</Label>
              <Input
                id="platform-s3-bucket"
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                placeholder={t("bucketPlaceholder")}
                className="mt-1.5"
                disabled={saving || testing}
              />
            </div>

            <div>
              <Label htmlFor="platform-s3-region">{t("regionLabel")}</Label>
              <Input
                id="platform-s3-region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder={t("regionPlaceholder")}
                className="mt-1.5"
                disabled={saving || testing}
              />
            </div>

            <div>
              <Label htmlFor="platform-s3-access-key">{t("accessKeyIdLabel")}</Label>
              <Input
                id="platform-s3-access-key"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                placeholder={t("accessKeyPlaceholder")}
                className="mt-1.5"
                disabled={saving || testing}
              />
            </div>

            <div>
              <Label htmlFor="platform-s3-secret-key">{t("secretKeyLabel")}</Label>
              <Input
                id="platform-s3-secret-key"
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder={t("secretKeyPlaceholder")}
                className="mt-1.5"
                disabled={saving || testing}
              />
            </div>

            <div>
              <Label htmlFor="platform-s3-endpoint">{t("endpointLabel")}</Label>
              <Input
                id="platform-s3-endpoint"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder={t("endpointPlaceholder")}
                className="mt-1.5"
                disabled={saving || testing}
              />
            </div>

            {testResult && (
              <div
                className={`flex items-center gap-2 text-sm ${
                  testResult.success ? "text-green-600" : "text-destructive"
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <XCircle className="size-4" />
                )}
                {testResult.success
                  ? t("connectionSuccessful")
                  : testResult.error || t("connectionFailed")}
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleTest} disabled={saving || testing}>
                {testing && <Loader2 className="size-4 animate-spin" />}
                {testing ? t("testing") : t("testConnection")}
              </Button>
              <Button onClick={handleSave} disabled={saving || testing}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {saving ? t("saving") : t("save")}
              </Button>
              {editing && (
                <Button variant="outline" onClick={handleCancel} disabled={saving || testing}>
                  {t("cancel")}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
