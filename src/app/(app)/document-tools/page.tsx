import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AnalyzerSection } from "@/components/analyze/analyzer-section";
import { DeskSection } from "@/components/analyze/desk-section";
import { getAllDocuments } from "@/lib/db-imports";
import type { Document } from "@/lib/types";

export default function DocumentToolsPage() {
  let documents: Document[] = [];
  try {
    documents = getAllDocuments() as Document[];
  } catch {
    // Fall back to empty array — DeskSection handles this gracefully
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Analyze & Process</h2>
        <p className="text-sm text-muted-foreground mt-1">
          AI-powered document analysis and multi-mode processing tools.
        </p>
      </div>
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
      <Card>
        <CardHeader>
          <CardTitle>Select a Mode</CardTitle>
          <CardDescription>
            Respond to a regulator query with cross-referenced sources, auto-answer a questionnaire, or review an NDA for risks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeskSection documents={documents} />
        </CardContent>
      </Card>
    </div>
  );
}
