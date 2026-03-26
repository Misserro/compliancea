"use client";

import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";

export function LanguageSwitcher() {
  const locale = useLocale();
  const alternateLocale = locale === "en" ? "pl" : "en";
  const alternateLabel = locale === "en" ? "PL" : "EN";

  async function handleSwitch() {
    await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: alternateLocale }),
    });
    window.location.reload();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleSwitch}
      className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
      title={`Switch to ${alternateLabel}`}
    >
      <Globe className="h-4 w-4" />
      <span className="text-xs">{alternateLabel}</span>
    </Button>
  );
}
