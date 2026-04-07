"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AnalyzerSection } from "@/components/analyze/analyzer-section";
import { DeskSection } from "@/components/analyze/desk-section";
import { AskSection } from "@/components/analyze/ask-section";
import type { Document } from "@/lib/types";

type Tab = "analyze" | "ask";

export default function DocumentAiToolsPage() {
  const t = useTranslations("Documents");
  const [activeTab, setActiveTab] = useState<Tab>("analyze");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDocuments() {
      try {
        const res = await fetch("/api/documents");
        if (res.ok) {
          const data = await res.json();
          setDocuments(data.documents ?? []);
        }
      } catch {
        // DeskSection and AskSection handle empty documents gracefully
      } finally {
        setLoading(false);
      }
    }
    fetchDocuments();
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{t("aiTools.title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("aiTools.subtitle")}</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        {(["analyze", "ask"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(`aiTools.tab.${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === "analyze" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("analyze.analyzerTitle")}</CardTitle>
              <CardDescription>{t("analyze.analyzerSubtitle")}</CardDescription>
            </CardHeader>
            <CardContent>
              <AnalyzerSection />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("analyze.selectModeTitle")}</CardTitle>
              <CardDescription>{t("analyze.selectModeSubtitle")}</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-40 w-full" /> : <DeskSection documents={documents} />}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "ask" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("ask.cardTitle")}</CardTitle>
            <CardDescription>{t("ask.cardSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-3/4" />
              </div>
            ) : (
              <AskSection documents={documents} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
