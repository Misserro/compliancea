"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DeskSection } from "@/components/analyze/desk-section";
import type { Document } from "@/lib/types";

export default function ProcessPage() {
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
        // DeskSection handles empty documents gracefully
      } finally {
        setLoading(false);
      }
    }
    fetchDocuments();
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Process</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Respond to regulator queries, process questionnaires, and review NDAs using your document library.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Select a Mode</CardTitle>
          <CardDescription>
            Select a mode: respond to a regulator query with cross-referenced sources, auto-answer a questionnaire, or review an NDA for risks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-3/4" />
            </div>
          ) : (
            <DeskSection documents={documents} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
