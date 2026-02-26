"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { DocumentSelectList } from "@/components/analyze/document-select-list";
import type { Document, Source } from "@/lib/types";
import { StatusMessage } from "@/components/ui/status-message";
import { isInForce } from "@/lib/utils";

interface AskSectionProps {
  documents: Document[];
}

interface AskResult {
  answer: string;
  sources: Source[];
  tokenUsage?: unknown;
}

export function AskSection({ documents }: AskSectionProps) {
  const [searchEntireLibrary, setSearchEntireLibrary] = useState(false);
  const [includeHistorical, setIncludeHistorical] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ message: string; type: "info" | "success" | "error" } | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);

  const activeDocuments = documents.filter(
    (d) => isInForce(d.in_force) && !d.superseded_by && d.status !== "archived"
  );
  const displayDocuments = includeHistorical ? documents : activeDocuments;

  const canAsk =
    question.trim().length > 0 &&
    (searchEntireLibrary || selectedIds.size > 0);

  async function handleAsk() {
    if (!canAsk) return;

    setLoading(true);
    setResult(null);
    setStatus({ message: "Searching and generating answer...", type: "info" });

    try {
      const body: { question: string; documentIds?: number[]; includeHistorical?: boolean } = {
        question: question.trim(),
        includeHistorical,
      };

      if (!searchEntireLibrary) {
        body.documentIds = Array.from(selectedIds);
      }

      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        setStatus({ message: `Request failed: ${data.error || "Unknown error"}`, type: "error" });
        return;
      }

      const data: AskResult = await res.json();
      setResult(data);
      setStatus({ message: "Answer generated.", type: "success" });
    } catch (err) {
      setStatus({
        message: `Network error: ${err instanceof Error ? err.message : String(err)}`,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  function confidenceColor(relevance: number): string {
    if (relevance >= 0.8) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    if (relevance >= 0.5) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  }

  return (
    <div className="space-y-4">
      {/* Search toggles */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="search-entire"
            checked={searchEntireLibrary}
            onCheckedChange={(checked) => setSearchEntireLibrary(!!checked)}
          />
          <Label htmlFor="search-entire" className="text-sm font-normal cursor-pointer">
            Search entire library
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="include-historical"
            checked={includeHistorical}
            onCheckedChange={(checked) => setIncludeHistorical(!!checked)}
          />
          <Label htmlFor="include-historical" className="text-sm font-normal cursor-pointer">
            Include historical versions
          </Label>
        </div>
      </div>

      {/* Document selection */}
      {!searchEntireLibrary && (
        <div className="space-y-2">
          <Label>
            Select documents to search
            {!includeHistorical && activeDocuments.length < documents.length && (
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                (active only — {activeDocuments.length} of {documents.length})
              </span>
            )}
          </Label>
          <DocumentSelectList
            documents={displayDocuments}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            maxHeight="250px"
          />
        </div>
      )}

      {/* Question input */}
      <div className="space-y-2">
        <Label htmlFor="ask-question">Your question</Label>
        <Textarea
          id="ask-question"
          placeholder="Ask a question about your documents..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
        />
      </div>

      {/* Ask button */}
      <Button onClick={handleAsk} disabled={!canAsk || loading}>
        {loading ? "Searching..." : "Ask"}
      </Button>

      {/* Status */}
      {status && <StatusMessage type={status.type} message={status.message} />}

      {/* Results */}
      {result && (
        <div className="space-y-4 pt-2">
          <Separator />

          {/* Answer */}
          <div>
            <h4 className="text-sm font-medium mb-2">Answer</h4>
            <div className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/50 rounded-md p-4">
              {result.answer}
            </div>
          </div>

          {/* Sources */}
          {result.sources && result.sources.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Sources</h4>
              <div className="space-y-2">
                {result.sources.map((source, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-2 rounded-md border p-3"
                  >
                    <span className="text-sm font-medium">
                      {source.documentName}
                    </span>
                    <Badge
                      className={confidenceColor(source.relevance)}
                    >
                      {Math.round(source.relevance * 100)}%
                    </Badge>
                    {source.docType && (
                      <Badge variant="outline">{source.docType}</Badge>
                    )}
                    {source.category && (
                      <Badge variant="secondary">{source.category}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
