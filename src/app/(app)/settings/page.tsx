"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { AIConfigSection } from "@/components/settings/ai-config-section";
import { GDriveSection } from "@/components/settings/gdrive-section";
import { StorageSection } from "@/components/settings/storage-section";
import { PoliciesSection } from "@/components/settings/policies-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Settings } from "@/lib/types";

export default function SettingsPage() {
  const t = useTranslations("Settings");
  const { data: sessionData } = useSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      toast.error(t("failedToLoad", { error: err instanceof Error ? err.message : t("unknownError") }));
    }
  }, [t]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  function handleSettingsChange(updates: Partial<Settings>) {
    if (settings) {
      setSettings({ ...settings, ...updates });
    }
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        toast.success(t("settingsSaved"));
      } else {
        const data = await res.json();
        toast.error(data.error || t("failedToSave"));
      }
    } catch (err) {
      toast.error(t("error", { error: err instanceof Error ? err.message : t("unknownError") }));
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    try {
      const res = await fetch("/api/settings/reset", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        toast.success(t("settingsResetToDefaults"));
      }
    } catch (err) {
      toast.error(t("resetFailed", { error: err instanceof Error ? err.message : t("unknownError") }));
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{t("title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("subtitle")}
        </p>
      </div>

      <AIConfigSection
        settings={settings}
        onSettingsChange={handleSettingsChange}
        onSave={handleSave}
        onReset={handleReset}
        saving={saving}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("policies")}</CardTitle>
        </CardHeader>
        <CardContent>
          <PoliciesSection
            selectedTypes={settings?.policiesTabDocTypes ?? ["policy", "procedure"]}
            onChange={(types) => handleSettingsChange({ policiesTabDocTypes: types })}
          />
        </CardContent>
      </Card>

      <GDriveSection />

      <StorageSection
        orgId={Number(sessionData?.user?.orgId)}
        orgRole={sessionData?.user?.orgRole || ""}
      />
    </div>
  );
}
