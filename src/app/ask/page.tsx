"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AskSection } from "@/components/analyze/ask-section";
import type { Document } from "@/lib/types";

export default function AskPage() {
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
        <h2 className="text-2xl font-semibold tracking-tight">Ask Library</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Ask questions and get answers with semantic search across your document library.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Ask the Library</CardTitle>
          <CardDescription>
            Select documents to search across, type your question, and get answers with source references.
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
