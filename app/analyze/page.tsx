"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AnalyzerSection } from "@/components/analyze/analyzer-section";
import { AskSection } from "@/components/analyze/ask-section";
import { DeskSection } from "@/components/analyze/desk-section";
import type { Document } from "@/lib/types";

export default function AnalyzePage() {
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
        // Documents will remain empty; sections handle empty state
      } finally {
        setLoading(false);
      }
    }
    fetchDocuments();
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Analyze &amp; Ask</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Upload documents for analysis, ask questions across your library, or process regulator queries and questionnaires.
        </p>
      </div>

      {/* Section A: Document Analyzer */}
      <Card>
        <CardHeader>
          <CardTitle>Document Analyzer</CardTitle>
          <CardDescription>
            Upload a document to translate, summarize, extract key points, or generate department to-do lists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnalyzerSection />
        </CardContent>
      </Card>

      {/* Section B: Ask the Library */}
      <Card>
        <CardHeader>
          <CardTitle>Ask the Library</CardTitle>
          <CardDescription>
            Ask questions and get answers with semantic search across your document library.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading documents...</p>
          ) : (
            <AskSection documents={documents} />
          )}
        </CardContent>
      </Card>

      {/* Section C: Cross-Reference & Questionnaire */}
      <Card>
        <CardHeader>
          <CardTitle>Cross-Reference &amp; Questionnaire</CardTitle>
          <CardDescription>
            Analyze regulator queries with cross-referencing or process questionnaires with automated answers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading documents...</p>
          ) : (
            <DeskSection documents={documents} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
