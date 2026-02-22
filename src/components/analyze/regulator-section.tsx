"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DocumentSelectList } from "@/components/analyze/document-select-list";
import { downloadBlob, escapeHtml } from "@/lib/utils";
import type { Document, DeskResult, CrossReference } from "@/lib/types";

interface RegulatorSectionProps {
  documents: Document[];
}

const LANGUAGES = ["English", "Polish", "German", "French", "Spanish"];

export function RegulatorSection({ documents }: RegulatorSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [outputs, setOutputs] = useState<Set<string>>(
    new Set(["generate_template"])
  );
  const [preFill, setPreFill] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [targetLanguage, setTargetLanguage] = useState("English");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    message: string;
    type: "info" | "success" | "error";
  } | null>(null);
  const [result, setResult] = useState<DeskResult | null>(null);

  function toggleOutput(key: string) {
    setOutputs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleAnalyze() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setStatus({ message: "Please select a file.", type: "error" });
      return;
    }

    if (outputs.size === 0) {
      setStatus({ message: "Select at least one output.", type: "error" });
      return;
    }

    setLoading(true);
    setResult(null);
    setStatus({ message: "Analyzing regulator query...", type: "info" });

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("targetLanguage", targetLanguage);
      for (const output of outputs) {
        fd.append("outputs", output);
      }
      if (preFill && selectedIds.size > 0) {
        fd.append("documentIds", JSON.stringify(Array.from(selectedIds)));
        fd.append("preFill", "true");
      }

      const res = await fetch("/api/desk/analyze", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        setStatus({
          message: `Analysis failed: ${data.error || "Unknown error"}`,
          type: "error",
        });
        return;
      }

      const data: DeskResult = await res.json();
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

  function exportTemplate() {
    if (!result?.response_template) return;
    const html = `<html><body><pre>${escapeHtml(result.response_template)}</pre></body></html>`;
    downloadBlob(
      html,
      "response-template.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  }

  function confidenceBadgeClass(confidence: string): string {
    switch (confidence) {
      case "high":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "low":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "";
    }
  }

  return (
    <div className="space-y-4">
      {/* File input */}
      <div className="space-y-2">
        <Label htmlFor="regulator-file">Regulator query document (PDF or DOCX)</Label>
        <Input
          id="regulator-file"
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        />
      </div>

      {/* Output checkboxes */}
      <div className="space-y-2">
        <Label>Outputs</Label>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="desk-cross-ref"
              checked={outputs.has("cross_reference")}
              onCheckedChange={() => toggleOutput("cross_reference")}
            />
            <Label htmlFor="desk-cross-ref" className="text-sm font-normal cursor-pointer">
              Cross-Reference
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="desk-template"
              checked={outputs.has("generate_template")}
              onCheckedChange={() => toggleOutput("generate_template")}
            />
            <Label htmlFor="desk-template" className="text-sm font-normal cursor-pointer">
              Generate Response Template
            </Label>
          </div>
        </div>
      </div>

      {/* Pre-fill toggle */}
      <div className="flex items-center gap-3">
        <Switch
          id="pre-fill"
          checked={preFill}
          onCheckedChange={setPreFill}
        />
        <Label htmlFor="pre-fill" className="text-sm cursor-pointer">
          Pre-fill with library data
        </Label>
      </div>

      {/* Document selection for cross-reference */}
      {(outputs.has("cross_reference") || preFill) && (
        <div className="space-y-2">
          <Label>Select library documents for cross-reference</Label>
          <DocumentSelectList
            documents={documents}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            maxHeight="250px"
          />
        </div>
      )}

      {/* Language select */}
      <div className="space-y-2">
        <Label>Target Language</Label>
        <Select value={targetLanguage} onValueChange={setTargetLanguage}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((lang) => (
              <SelectItem key={lang} value={lang}>
                {lang}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Analyze button */}
      <Button onClick={handleAnalyze} disabled={loading || outputs.size === 0}>
        {loading ? "Analyzing..." : "Analyze"}
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

      {/* Results */}
      {result && (
        <div className="space-y-4 pt-2">
          <Separator />

          {/* Cross-reference table */}
          {result.cross_reference && result.cross_reference.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Cross-Reference Results</h4>
              <div className="rounded-md border overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Question</th>
                      <th className="text-left p-3 font-medium">Answer</th>
                      <th className="text-left p-3 font-medium">Found In</th>
                      <th className="text-left p-3 font-medium">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.cross_reference.map(
                      (ref: CrossReference, i: number) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="p-3">{ref.question}</td>
                          <td className="p-3">
                            {ref.answer || (
                              <span className="text-muted-foreground">
                                Not found
                              </span>
                            )}
                          </td>
                          <td className="p-3">{ref.found_in}</td>
                          <td className="p-3">
                            <Badge
                              className={confidenceBadgeClass(ref.confidence)}
                            >
                              {ref.confidence}
                            </Badge>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Response template */}
          {result.response_template && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">Response Template</h4>
                <Button variant="outline" size="sm" onClick={exportTemplate}>
                  Export as DOCX
                </Button>
              </div>
              <pre className="text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-4 max-h-96 overflow-auto">
                {result.response_template}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
