"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Settings2 } from "lucide-react";

const FEATURE_LABELS: Record<string, string> = {
  contracts: "Contracts",
  legal_hub: "Legal Hub",
  template_editor: "Template Editor",
  court_fee_calculator: "Court Fee Calculator",
  policies: "Policies",
  qa_cards: "Q&A Cards",
};

interface OrgFeatureFlagsProps {
  orgId: number;
}

export function OrgFeatureFlags({ orgId }: OrgFeatureFlagsProps) {
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const loadFeatures = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/features`);
      if (res.ok) {
        const data = await res.json();
        setFeatures(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (expanded) loadFeatures();
  }, [expanded, loadFeatures]);

  async function handleToggle(feature: string, enabled: boolean) {
    // Optimistic update
    const prev = { ...features };
    setFeatures((f) => ({ ...f, [feature]: enabled }));

    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/features`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [feature]: enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setFeatures(data);
        toast.success(
          `${FEATURE_LABELS[feature] ?? feature} ${enabled ? "enabled" : "disabled"}`
        );
      } else {
        setFeatures(prev);
        const data = await res.json();
        toast.error(data.error || "Failed to update feature");
      }
    } catch (err) {
      setFeatures(prev);
      toast.error(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }

  return (
    <div className="border-t bg-muted/20">
      <button
        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <Settings2 className="size-3.5" />
        {expanded ? "Hide features" : "Manage features"}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <div className="rounded-md border divide-y text-sm">
              {Object.entries(FEATURE_LABELS).map(([feature, label]) => (
                <div
                  key={feature}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <span className="font-medium">{label}</span>
                  <Switch
                    checked={features[feature] ?? true}
                    onCheckedChange={(checked) =>
                      handleToggle(feature, checked)
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
