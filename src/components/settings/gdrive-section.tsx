"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function GDriveSection() {
  const t = useTranslations("Settings");
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [folderId, setFolderId] = useState("");
  const [historicalCutoff, setHistoricalCutoff] = useState(() => new Date().toISOString().slice(0, 10));
  const [hasCredentials, setHasCredentials] = useState(false);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/gdrive/settings")
      .then((r) => r.json())
      .then((data) => {
        setFolderId(data.folderId || "");
        setHasCredentials(data.hasCredentials || false);
        setEmail(data.serviceAccountEmail || "");
        if (data.historicalCutoff) {
          setHistoricalCutoff(data.historicalCutoff);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (serviceAccountJson.trim()) {
        body.serviceAccountJson = serviceAccountJson;
      }
      body.folderId = folderId;
      body.historicalCutoff = historicalCutoff;

      const res = await fetch("/api/gdrive/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setHasCredentials(data.hasCredentials);
        setEmail(data.serviceAccountEmail || "");
        setServiceAccountJson("");
        if (data.historicalCutoff) {
          setHistoricalCutoff(data.historicalCutoff);
        }
        toast.success("Google Drive settings saved");
      } else {
        toast.error(data.error || "Failed to save settings");
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Google Drive Integration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasCredentials && email && (
          <p className="text-sm text-muted-foreground">
            Connected as: <span className="font-medium">{email}</span>
          </p>
        )}

        <div>
          <Label htmlFor="service-account">
            Service Account JSON {hasCredentials && "(leave empty to keep current)"}
          </Label>
          <Textarea
            id="service-account"
            value={serviceAccountJson}
            onChange={(e) => setServiceAccountJson(e.target.value)}
            placeholder='Paste your service account JSON here...'
            rows={4}
            className="mt-1.5 font-mono text-xs"
          />
        </div>

        <div>
          <Label htmlFor="folder-id">{t("driveIdLabel")}</Label>
          <Input
            id="folder-id"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            placeholder="1ABC2DEF3GHI..."
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="historical-cutoff">{t("historicalCutoff")}</Label>
          <Input
            id="historical-cutoff"
            type="date"
            value={historicalCutoff}
            onChange={(e) => setHistoricalCutoff(e.target.value)}
            className="mt-1.5"
          />
          <p className="text-xs text-muted-foreground mt-1">{t("historicalCutoffHelp")}</p>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Google Drive Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
