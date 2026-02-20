"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DocumentSelectList } from "@/components/analyze/document-select-list";
import { downloadBlob, escapeHtml } from "@/lib/utils";
import type {
  Document,
  DeskResult,
  CrossReference,
  QuestionnaireQuestion,
} from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { NdaAnalysisResult } from "@/lib/types";

interface DeskSectionProps {
  documents: Document[];
}

type DeskMode = "regulator" | "questionnaire" | "nda";

const LANGUAGES = ["English", "Polish", "German", "French", "Spanish"];

export function DeskSection({ documents }: DeskSectionProps) {
  const [mode, setMode] = useState<DeskMode>("regulator");

  return (
    <div className="space-y-4">
      <RadioGroup
        value={mode}
        onValueChange={(v) => setMode(v as DeskMode)}
        className="flex gap-6"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="regulator" id="mode-regulator" />
          <Label htmlFor="mode-regulator" className="cursor-pointer">
            Regulator Query
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="questionnaire" id="mode-questionnaire" />
          <Label htmlFor="mode-questionnaire" className="cursor-pointer">
            Questionnaire
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="nda" id="mode-nda" />
          <Label htmlFor="mode-nda" className="cursor-pointer">
            NDA Review
          </Label>
        </div>
      </RadioGroup>

      <Separator />

      {mode === "regulator" ? (
        <RegulatorMode documents={documents} />
      ) : mode === "questionnaire" ? (
        <QuestionnaireMode documents={documents} />
      ) : (
        <NdaReviewMode />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Regulator Query Mode
   ───────────────────────────────────────────── */

function RegulatorMode({ documents }: { documents: Document[] }) {
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

/* ─────────────────────────────────────────────
   Questionnaire Mode
   ───────────────────────────────────────────── */

function QuestionnaireMode({ documents }: { documents: Document[] }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pastedText, setPastedText] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    message: string;
    type: "info" | "success" | "error";
  } | null>(null);
  const [questions, setQuestions] = useState<QuestionnaireQuestion[]>([]);
  const [approved, setApproved] = useState<Set<number>>(new Set());

  async function handleProcess() {
    const file = fileInputRef.current?.files?.[0];
    const hasText = pastedText.trim().length > 0;

    if (!file && !hasText) {
      setStatus({
        message: "Please upload a file or paste questionnaire text.",
        type: "error",
      });
      return;
    }

    setLoading(true);
    setQuestions([]);
    setApproved(new Set());
    setStatus({ message: "Processing questionnaire...", type: "info" });

    try {
      const fd = new FormData();
      if (file) {
        fd.append("file", file);
      }
      if (hasText) {
        fd.append("text", pastedText.trim());
      }
      if (selectedIds.size > 0) {
        fd.append("documentIds", JSON.stringify(Array.from(selectedIds)));
      }

      const res = await fetch("/api/desk/questionnaire", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        setStatus({
          message: `Processing failed: ${data.error || "Unknown error"}`,
          type: "error",
        });
        return;
      }

      const data = await res.json();
      const qs: QuestionnaireQuestion[] = data.questions || [];
      setQuestions(qs);
      setStatus({
        message: `Processed ${qs.length} question(s).`,
        type: "success",
      });
    } catch (err) {
      setStatus({
        message: `Network error: ${err instanceof Error ? err.message : String(err)}`,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  function toggleApprove(num: number) {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  }

  function approveAll() {
    setApproved(new Set(questions.map((q) => q.number)));
  }

  function approveHighConfidence() {
    setApproved(
      new Set(questions.filter((q) => q.confidence === "high").map((q) => q.number))
    );
  }

  function updateAnswer(num: number, answer: string) {
    setQuestions((prev) =>
      prev.map((q) => (q.number === num ? { ...q, answer } : q))
    );
  }

  async function handleApproveSubmit() {
    const approvedQuestions = questions.filter((q) => approved.has(q.number));
    if (approvedQuestions.length === 0) {
      setStatus({ message: "No questions approved.", type: "error" });
      return;
    }

    setLoading(true);
    setStatus({ message: "Submitting approved answers...", type: "info" });

    try {
      const res = await fetch("/api/desk/questionnaire/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: approvedQuestions }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        setStatus({
          message: `Approval failed: ${data.error || "Unknown error"}`,
          type: "error",
        });
        return;
      }

      const data = await res.json();
      setStatus({
        message: data.message || `Approved ${approvedQuestions.length} question(s).`,
        type: "success",
      });
    } catch (err) {
      setStatus({
        message: `Network error: ${err instanceof Error ? err.message : String(err)}`,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (questions.length === 0) return;
    const rows: string[][] = [
      ["Number", "Question", "Answer", "Confidence", "Source", "Evidence"],
    ];
    for (const q of questions) {
      const evidenceStr = q.evidence
        .map(
          (e) =>
            `${e.documentName}${e.relevance != null ? ` (${Math.round(e.relevance * 100)}%)` : ""}`
        )
        .join("; ");
      rows.push([
        String(q.number),
        (q.text || "").replaceAll('"', '""'),
        (q.answer || "").replaceAll('"', '""'),
        q.confidence,
        q.source,
        evidenceStr.replaceAll('"', '""'),
      ]);
    }
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    downloadBlob(csv, "questionnaire-answers.csv", "text/csv;charset=utf-8;");
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
        <Label htmlFor="questionnaire-file">
          Questionnaire file (PDF, DOCX, or Excel)
        </Label>
        <Input
          id="questionnaire-file"
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        />
      </div>

      {/* Or paste text */}
      <div className="space-y-2">
        <Label htmlFor="questionnaire-text">Or paste questionnaire text</Label>
        <Textarea
          id="questionnaire-text"
          placeholder="Paste your questionnaire questions here..."
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          rows={4}
        />
      </div>

      {/* Library document selection */}
      <div className="space-y-2">
        <Label>Select library documents for answering</Label>
        <DocumentSelectList
          documents={documents}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          maxHeight="250px"
        />
      </div>

      {/* Process button */}
      <Button onClick={handleProcess} disabled={loading}>
        {loading ? "Processing..." : "Process Questionnaire"}
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

      {/* Review cards */}
      {questions.length > 0 && (
        <div className="space-y-4 pt-2">
          <Separator />

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={approveAll}>
              Approve All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={approveHighConfidence}
            >
              Approve High Confidence
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              Export as CSV
            </Button>
            <Button
              size="sm"
              onClick={handleApproveSubmit}
              disabled={loading || approved.size === 0}
            >
              Submit Approved ({approved.size})
            </Button>
          </div>

          {/* Question cards */}
          <div className="space-y-3">
            {questions.map((q) => (
              <div
                key={q.number}
                className="rounded-md border p-4 space-y-3"
              >
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={approved.has(q.number)}
                      onCheckedChange={() => toggleApprove(q.number)}
                    />
                    <span className="text-sm font-medium">
                      Q{q.number}:
                    </span>
                    <span className="text-sm">{q.text}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={confidenceBadgeClass(q.confidence)}>
                      {q.confidence}
                    </Badge>
                    <Badge variant="outline">
                      {q.source}
                    </Badge>
                  </div>
                </div>

                {/* Editable answer */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Answer
                  </Label>
                  <Textarea
                    value={q.answer}
                    onChange={(e) => updateAnswer(q.number, e.target.value)}
                    rows={3}
                    className="text-sm"
                  />
                </div>

                {/* Evidence */}
                {q.evidence && q.evidence.length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Evidence
                    </Label>
                    <div className="mt-1 space-y-1">
                      {q.evidence.map((ev, j) => (
                        <div
                          key={j}
                          className="flex items-center gap-2 text-xs"
                        >
                          <span className="font-medium">
                            {ev.documentName}
                          </span>
                          {ev.relevance != null && (
                            <Badge
                              variant="outline"
                              className="text-xs"
                            >
                              {Math.round(ev.relevance * 100)}%
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   NDA Review Mode
   ───────────────────────────────────────────── */

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

function NdaReviewMode() {
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
    const html = `<html><body><pre style="white-space:pre-wrap;font-family:serif;">${result.markdown
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")}</pre></body></html>`;
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
          <div className="rounded-md border bg-muted/30 p-4 overflow-auto max-h-[600px] text-sm [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h4]:text-sm [&_h4]:font-medium [&_h4]:mt-2 [&_h4]:mb-1 [&_p]:my-1 [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left [&_th]:font-medium [&_td]:border [&_td]:border-border [&_td]:p-2 [&_hr]:my-3 [&_hr]:border-border">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {result.markdown}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
