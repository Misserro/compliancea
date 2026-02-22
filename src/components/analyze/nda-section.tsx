"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadBlob, escapeHtml } from "@/lib/utils";
import type { Document, NdaAnalysisResult } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface NdaSectionProps {
  documents: Document[];
}

const JURISDICTIONS = [
  "Poland",
  "European Union",
  "United Kingdom",
  "United States",
  "Germany",
  "France",
  "Netherlands",
  "Switzerland",
  "Singapore",
  "Other",
];

export function NdaSection({ documents: _documents }: NdaSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jurisdiction, setJurisdiction] = useState("");
  const [customJurisdiction, setCustomJurisdiction] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    message: string;
    type: "info" | "success" | "error";
  } | null>(null);
  const [result, setResult] = useState<NdaAnalysisResult | null>(null);

  function getEffectiveJurisdiction(): string {
    if (jurisdiction === "Other") return customJurisdiction.trim();
    return jurisdiction;
  }

  async function handleReview() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setStatus({ message: "Please select a PDF or DOCX file.", type: "error" });
      return;
    }
    if (!jurisdiction) {
      setStatus({ message: "Please select a jurisdiction.", type: "error" });
      return;
    }
    if (jurisdiction === "Other" && !customJurisdiction.trim()) {
      setStatus({ message: "Please enter a jurisdiction.", type: "error" });
      return;
    }

    setLoading(true);
    setResult(null);
    setStatus({ message: "Analyzing NDA...", type: "info" });

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("jurisdiction", getEffectiveJurisdiction());

      const res = await fetch("/api/nda/analyze", { method: "POST", body: fd });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        setStatus({
          message: `Analysis failed: ${data.error || "Unknown error"}`,
          type: "error",
        });
        return;
      }

      const data: NdaAnalysisResult = await res.json();
      setResult(data);
      setStatus({ message: "Analysis complete.", type: "success" });
    } catch (err) {
      setStatus({
        message: `Network error: ${err instanceof Error ? err.message : String(err)}`,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleExport() {
    if (!result?.markdown) return;
    const html = `<html><body><pre style="white-space:pre-wrap;font-family:serif;">${escapeHtml(result.markdown)}</pre></body></html>`;
    downloadBlob(
      html,
      "nda-analysis-report.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  }

  return (
    <div className="space-y-4">
      {/* File input */}
      <div className="space-y-2">
        <Label htmlFor="nda-file">NDA document (PDF or DOCX)</Label>
        <Input
          id="nda-file"
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        />
      </div>

      {/* Jurisdiction dropdown */}
      <div className="space-y-2">
        <Label>Jurisdiction</Label>
        <Select value={jurisdiction} onValueChange={setJurisdiction}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select jurisdiction..." />
          </SelectTrigger>
          <SelectContent>
            {JURISDICTIONS.map((j) => (
              <SelectItem key={j} value={j}>
                {j}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Custom jurisdiction input — shown only when "Other" is selected */}
      {jurisdiction === "Other" && (
        <div className="space-y-2">
          <Label htmlFor="nda-custom-jurisdiction">Enter jurisdiction</Label>
          <Input
            id="nda-custom-jurisdiction"
            placeholder="e.g. Canada (Ontario), Australia"
            value={customJurisdiction}
            onChange={(e) => setCustomJurisdiction(e.target.value)}
            className="w-64"
          />
        </div>
      )}

      {/* Review button */}
      <Button onClick={handleReview} disabled={loading}>
        {loading ? "Analyzing..." : "Review NDA"}
      </Button>

      {/* Status */}
      {status && (
        <p
          className={`text-sm ${
            status.type === "error"
              ? "text-destructive"
              : status.type === "success"
              ? "text-green-600 dark:text-green-400"
              : "text-muted-foreground"
          }`}
        >
          {status.message}
        </p>
      )}

      {/* Result */}
      {result?.markdown && (
        <div className="space-y-3 pt-2">
          <Separator />
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">NDA Analysis Report</h4>
            <Button variant="outline" size="sm" onClick={handleExport}>
              Export as DOCX
            </Button>
          </div>
          <div className="rounded-md border bg-muted/30 p-4 overflow-auto max-h-[600px] text-sm [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h4]:text-sm [&_h4]:font-medium [&_h4]:mt-2 [&_h4]:mb-1 [&_p]:my-1 [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:my-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left [&_th]:font-medium [&_td]:border [&_td]:border-border [&_td]:p-2 [&_hr]:my-3 [&_hr]:border-border">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {result.markdown}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
