"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function GDriveSection() {
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [folderId, setFolderId] = useState("");
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
          <Label htmlFor="folder-id">Google Drive Folder ID</Label>
          <Input
            id="folder-id"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            placeholder="1ABC2DEF3GHI..."
            className="mt-1.5"
          />
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Google Drive Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
