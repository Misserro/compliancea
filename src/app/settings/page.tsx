"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { AIConfigSection } from "@/components/settings/ai-config-section";
import { GDriveSection } from "@/components/settings/gdrive-section";
import { MaintenanceSection } from "@/components/settings/maintenance-section";
import { StatisticsSection } from "@/components/settings/statistics-section";
import { PoliciesSection } from "@/components/settings/policies-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Settings } from "@/lib/types";

export default function SettingsPage() {
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
      toast.error(`Failed to load settings: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, []);

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
        toast.success("Settings saved");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save");
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
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
        toast.success("Settings reset to defaults");
      }
    } catch (err) {
      toast.error(`Reset failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure AI models, integrations, and maintenance.
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
          <CardTitle className="text-base">Policies</CardTitle>
        </CardHeader>
        <CardContent>
          <PoliciesSection
            selectedTypes={settings?.policiesTabDocTypes ?? ["policy", "procedure"]}
            onChange={(types) => handleSettingsChange({ policiesTabDocTypes: types })}
          />
        </CardContent>
      </Card>

      <GDriveSection />

      <MaintenanceSection />

      <StatisticsSection />
    </div>
  );
}
