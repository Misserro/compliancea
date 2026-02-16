"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Settings } from "@/lib/types";

interface AIConfigSectionProps {
  settings: Settings | null;
  onSettingsChange: (updates: Partial<Settings>) => void;
  onSave: () => void;
  onReset: () => void;
  saving: boolean;
}

export function AIConfigSection({
  settings,
  onSettingsChange,
  onSave,
  onReset,
  saving,
}: AIConfigSectionProps) {
  if (!settings) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI & Optimization</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Use Haiku */}
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="haiku-toggle">Use Haiku for Extraction</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Use faster, cheaper model for simple extraction tasks
            </p>
          </div>
          <Switch
            id="haiku-toggle"
            checked={settings.useHaikuForExtraction}
            onCheckedChange={(checked) =>
              onSettingsChange({ useHaikuForExtraction: checked })
            }
          />
        </div>

        <Separator />

        {/* Skip Translation */}
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="skip-translation-toggle">Skip Translation if Same Language</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Auto-detect document language and skip redundant translation
            </p>
          </div>
          <Switch
            id="skip-translation-toggle"
            checked={settings.skipTranslationIfSameLanguage}
            onCheckedChange={(checked) =>
              onSettingsChange({ skipTranslationIfSameLanguage: checked })
            }
          />
        </div>

        <Separator />

        {/* Relevance Threshold */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="threshold-toggle">Relevance Threshold</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Filter out low-relevance search results
              </p>
            </div>
            <Switch
              id="threshold-toggle"
              checked={settings.useRelevanceThreshold}
              onCheckedChange={(checked) =>
                onSettingsChange({ useRelevanceThreshold: checked })
              }
            />
          </div>

          {settings.useRelevanceThreshold && (
            <div className="space-y-4 pl-4 border-l-2 border-muted">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Threshold Value</Label>
                  <span className="text-sm font-medium">
                    {Math.round(settings.relevanceThresholdValue * 100)}%
                  </span>
                </div>
                <Slider
                  value={[settings.relevanceThresholdValue * 100]}
                  onValueChange={([val]) =>
                    onSettingsChange({ relevanceThresholdValue: val / 100 })
                  }
                  min={0}
                  max={100}
                  step={1}
                />
              </div>

              <div>
                <Label htmlFor="min-results">Minimum Guaranteed Results</Label>
                <Input
                  id="min-results"
                  type="number"
                  min={1}
                  max={10}
                  value={settings.minResultsGuarantee}
                  onChange={(e) =>
                    onSettingsChange({
                      minResultsGuarantee: parseInt(e.target.value, 10) || 3,
                    })
                  }
                  className="mt-1.5 w-[100px]"
                />
              </div>
            </div>
          )}
        </div>

        <Separator />

        <div className="flex gap-2">
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (confirm("Reset all settings to defaults?")) onReset();
            }}
          >
            Reset to Defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
