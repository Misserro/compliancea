"use client";

import { useState, useEffect, useCallback } from "react";
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
      setError("All required fields must be filled.");
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
        toast.success("Connection test successful");
      } else {
        toast.error(data.error || "Connection test failed");
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
        toast.success("Platform S3 configuration saved");
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
        const msg = data.error || "Failed to save configuration.";
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
        toast.success("Platform S3 configuration removed");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to remove configuration");
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
            Platform Storage
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
              Platform-wide S3 storage is configured. Organizations with &quot;Platform S3&quot; storage policy will use this bucket.
            </p>
            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bucket</span>
                <span className="font-medium">{config.bucket}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Region</span>
                <span className="font-medium">{config.region}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Access Key ID</span>
                <span className="font-medium">{config.accessKeyId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Secret Access Key</span>
                <span className="font-medium">*****</span>
              </div>
              {config.endpoint && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Endpoint</span>
                  <span className="font-medium">{config.endpoint}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleEdit}>
                Edit
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
                    Remove configuration
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove platform S3 configuration</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to remove the platform S3 storage configuration?
                      Organizations using &quot;Platform S3&quot; policy will fall back to local storage.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRemove}
                      className="bg-destructive text-white hover:bg-destructive/90"
                    >
                      Remove
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
                Configure a platform-wide S3-compatible bucket (AWS S3, Cloudflare R2, MinIO).
                Organizations with &quot;Platform S3&quot; storage policy will use this bucket.
              </p>
            )}

            <div>
              <Label htmlFor="platform-s3-bucket">Bucket Name</Label>
              <Input
                id="platform-s3-bucket"
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                placeholder="my-platform-bucket"
                className="mt-1.5"
                disabled={saving || testing}
              />
            </div>

            <div>
              <Label htmlFor="platform-s3-region">Region</Label>
              <Input
                id="platform-s3-region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="us-east-1"
                className="mt-1.5"
                disabled={saving || testing}
              />
            </div>

            <div>
              <Label htmlFor="platform-s3-access-key">Access Key ID</Label>
              <Input
                id="platform-s3-access-key"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                placeholder="AKIAIOSFODNN7EXAMPLE"
                className="mt-1.5"
                disabled={saving || testing}
              />
            </div>

            <div>
              <Label htmlFor="platform-s3-secret-key">Secret Access Key</Label>
              <Input
                id="platform-s3-secret-key"
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="Enter secret access key"
                className="mt-1.5"
                disabled={saving || testing}
              />
            </div>

            <div>
              <Label htmlFor="platform-s3-endpoint">Endpoint URL (optional)</Label>
              <Input
                id="platform-s3-endpoint"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://... (leave blank for AWS S3)"
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
                  ? "Connection successful"
                  : testResult.error || "Connection failed"}
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleTest} disabled={saving || testing}>
                {testing && <Loader2 className="size-4 animate-spin" />}
                {testing ? "Testing..." : "Test Connection"}
              </Button>
              <Button onClick={handleSave} disabled={saving || testing}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {saving ? "Saving..." : "Save"}
              </Button>
              {editing && (
                <Button variant="outline" onClick={handleCancel} disabled={saving || testing}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
