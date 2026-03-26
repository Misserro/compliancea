"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslations } from "next-intl";
import { AskSection } from "@/components/analyze/ask-section";
import type { Document } from "@/lib/types";

export default function AskPage() {
  const t = useTranslations('Documents');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDocuments() {
      try {
        const res = await fetch("/api/documents");
        if (res.ok) {
          const data = await res.json();
          setDocuments(data.documents || []);
        }
      } catch {
        // AskSection handles empty documents gracefully
      } finally {
        setLoading(false);
      }
    }
    fetchDocuments();
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{t('ask.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('ask.subtitle')}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('ask.cardTitle')}</CardTitle>
          <CardDescription>
            {t('ask.cardSubtitle')}
          </CardDescription>
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
    </div>
  );
}
