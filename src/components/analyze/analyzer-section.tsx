"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DEPARTMENTS } from "@/lib/constants";
import { downloadBlob, escapeHtml } from "@/lib/utils";
import type { AnalyzerResult, KeyPoint, TodoItem } from "@/lib/types";
import { StatusMessage } from "@/components/ui/status-message";

type OutputOption = "translation" | "summary" | "key_points" | "todos";

const LANGUAGES = ["English", "Polish", "German", "French", "Spanish"];

export function AnalyzerSection() {
  const t = useTranslations('Documents');
  const OUTPUT_OPTIONS: { value: OutputOption; label: string; defaultChecked: boolean }[] = [
    { value: "translation", label: t('analyzer.fullTranslation'), defaultChecked: true },
    { value: "summary", label: t('analyzer.summary'), defaultChecked: true },
    { value: "key_points", label: t('analyzer.keyPoints'), defaultChecked: false },
    { value: "todos", label: t('analyzer.departmentTodoList'), defaultChecked: false },
  ];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedOutputs, setSelectedOutputs] = useState<Set<OutputOption>>(
    new Set(OUTPUT_OPTIONS.filter((o) => o.defaultChecked).map((o) => o.value))
  );
  const [targetLanguage, setTargetLanguage] = useState("English");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ message: string; type: "info" | "success" | "error" } | null>(null);
  const [result, setResult] = useState<AnalyzerResult | null>(null);
  const [translationOpen, setTranslationOpen] = useState(true);

  function toggleOutput(output: OutputOption) {
    setSelectedOutputs((prev) => {
      const next = new Set(prev);
      if (next.has(output)) {
        next.delete(output);
      } else {
        next.add(output);
      }
      return next;
    });
  }

  function handleClear() {
    setResult(null);
    setStatus(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleAnalyze() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setStatus({ message: t('analyzer.selectFile'), type: "error" });
      return;
    }

    if (selectedOutputs.size === 0) {
      setStatus({ message: t('analyzer.selectOutput'), type: "error" });
      return;
    }

    setLoading(true);
    setResult(null);
    setStatus({ message: t('analyzer.uploading'), type: "info" });

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("targetLanguage", targetLanguage);
      for (const output of selectedOutputs) {
        fd.append("outputs", output);
      }

      const res = await fetch("/api/analyze", { method: "POST", body: fd });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        setStatus({ message: t('analyzer.analysisFailed', { error: data.error || "Unknown error" }), type: "error" });
        return;
      }

      const data: AnalyzerResult = await res.json();
      setResult(data);
      setStatus({ message: t('analyzer.analysisComplete'), type: "success" });
    } catch (err) {
      setStatus({
        message: t('analyzer.networkError', { error: err instanceof Error ? err.message : String(err) }),
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  function exportTranslation() {
    if (!result?.translated_text) return;
    const html = `<html><body><pre>${escapeHtml(result.translated_text)}</pre></body></html>`;
    downloadBlob(
      html,
      "translation.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  }

  function exportTodosCsv() {
    if (!result?.todos_by_department) return;
    const rows: string[][] = [["department", "task", "source_point"]];
    for (const dept of DEPARTMENTS) {
      const items: TodoItem[] = result.todos_by_department[dept] || [];
      for (const item of items) {
        rows.push([
          dept,
          (item.task || "").replaceAll('"', '""'),
          (item.source_point || "").replaceAll('"', '""'),
        ]);
      }
    }
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    downloadBlob(csv, "todos.csv", "text/csv;charset=utf-8;");
  }

  return (
    <div className="space-y-4">
      {/* File input */}
      <div className="space-y-2">
        <Label htmlFor="analyzer-file">{t('analyzer.fileLabel')}</Label>
        <Input
          id="analyzer-file"
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        />
      </div>

      {/* Output checkboxes */}
      <div className="space-y-2">
        <Label>{t('analyzer.outputs')}</Label>
        <div className="flex flex-wrap gap-4">
          {OUTPUT_OPTIONS.map((opt) => (
            <div key={opt.value} className="flex items-center gap-2">
              <Checkbox
                id={`output-${opt.value}`}
                checked={selectedOutputs.has(opt.value)}
                onCheckedChange={() => toggleOutput(opt.value)}
              />
              <Label htmlFor={`output-${opt.value}`} className="text-sm font-normal cursor-pointer">
                {opt.label}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* Language select */}
      <div className="space-y-2">
        <Label>{t('analyzer.targetLanguage')}</Label>
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

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          onClick={handleAnalyze}
          disabled={loading || selectedOutputs.size === 0}
        >
          {loading ? t('analyzer.analyzing') : t('analyzer.analyzeButton')}
        </Button>
        <Button variant="outline" onClick={handleClear} disabled={loading}>
          {t('analyzer.clear')}
        </Button>
      </div>

      {/* Status */}
      {status && <StatusMessage type={status.type} message={status.message} />}

      {/* Results */}
      {result && (
        <div className="space-y-4 pt-2">
          <Separator />

          {/* Translation */}
          {selectedOutputs.has("translation") && (
            <Collapsible open={translationOpen} onOpenChange={setTranslationOpen}>
              <div className="flex items-center justify-between">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="font-medium">
                    {translationOpen ? t('analyzer.hideTranslation') : t('analyzer.showTranslation')}
                  </Button>
                </CollapsibleTrigger>
                {result.translated_text && (
                  <Button variant="outline" size="sm" onClick={exportTranslation}>
                    {t('analyzer.exportDocx')}
                  </Button>
                )}
              </div>
              <CollapsibleContent>
                {result.translated_text ? (
                  <pre className="mt-2 text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-4 max-h-96 overflow-auto">
                    {result.translated_text}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground mt-2">
                    {t('analyzer.noTranslation')}
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Summary */}
          {selectedOutputs.has("summary") && (
            <div>
              <h4 className="text-sm font-medium mb-2">{t('analyzer.summaryHeading')}</h4>
              {result.summary ? (
                <p className="text-sm leading-relaxed">{result.summary}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('analyzer.noSummary')}
                </p>
              )}
            </div>
          )}

          {/* Key Points */}
          {selectedOutputs.has("key_points") && (
            <div>
              <h4 className="text-sm font-medium mb-2">{t('analyzer.keyPointsHeading')}</h4>
              {result.key_points && result.key_points.length > 0 ? (
                <div className="space-y-3">
                  {result.key_points.map((kp: KeyPoint, i: number) => (
                    <div key={i} className="rounded-md border p-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{kp.department}</Badge>
                        {kp.tags.map((tag, j) => (
                          <Badge key={j} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-sm">{kp.point}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('analyzer.noKeyPoints')}
                </p>
              )}
            </div>
          )}

          {/* Todos */}
          {selectedOutputs.has("todos") && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">{t('analyzer.todoHeading')}</h4>
                {result.todos_by_department && (
                  <Button variant="outline" size="sm" onClick={exportTodosCsv}>
                    {t('analyzer.exportCsv')}
                  </Button>
                )}
              </div>
              {result.todos_by_department ? (
                <div className="space-y-3">
                  {DEPARTMENTS.map((dept) => {
                    const items: TodoItem[] =
                      result.todos_by_department?.[dept] || [];
                    return (
                      <div key={dept}>
                        <h5 className="text-sm font-medium mb-1">{dept}</h5>
                        {items.length > 0 ? (
                          <div className="ml-4 space-y-2">
                            {items.map((item, i) => (
                              <div
                                key={i}
                                className="rounded border p-2 text-sm space-y-1"
                              >
                                <p>{item.task}</p>
                                {item.source_point && (
                                  <p className="text-xs text-muted-foreground">
                                    {t('analyzer.source', { point: item.source_point })}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="ml-4 text-sm text-muted-foreground">
                            {t('analyzer.noTasks')}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('analyzer.noTodos')}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
