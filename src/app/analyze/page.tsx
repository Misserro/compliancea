import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AnalyzerSection } from "@/components/analyze/analyzer-section";

export default function AnalyzePage() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Analyze</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a document to translate, summarize, extract key points, or generate department to-do lists.
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
    </div>
  );
}
