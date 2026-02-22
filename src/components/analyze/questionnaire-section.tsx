"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { DocumentSelectList } from "@/components/analyze/document-select-list";
import { downloadBlob } from "@/lib/utils";
import type { Document, QuestionnaireQuestion } from "@/lib/types";
import { StatusMessage } from "@/components/ui/status-message";

interface QuestionnaireSectionProps {
  documents: Document[];
}

export function QuestionnaireSection({ documents }: QuestionnaireSectionProps) {
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
      {status && <StatusMessage type={status.type} message={status.message} />}

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
