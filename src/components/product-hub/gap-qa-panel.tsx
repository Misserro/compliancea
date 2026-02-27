"use client";

import { useState } from "react";
import { MessageCircleQuestion, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QuestionSuggestion {
  question: string;
  suggestions: string[];
}

interface GapQaPanelProps {
  gaps: string[];
  suggestions: QuestionSuggestion[];
  loadingSuggestions: boolean;
  onSubmit: (answers: { question: string; answer: string }[]) => void;
  submitting: boolean;
}

export function GapQaPanel({
  gaps, suggestions, loadingSuggestions, onSubmit, submitting,
}: GapQaPanelProps) {
  const [answers, setAnswers] = useState<Record<number, string>>({});

  function setAnswer(index: number, value: string) {
    setAnswers(prev => ({ ...prev, [index]: value }));
  }

  function handleSubmit() {
    const answered = gaps
      .map((gap, i) => ({ question: gap, answer: answers[i] ?? '' }))
      .filter(a => a.answer.trim().length > 0);
    if (answered.length > 0) onSubmit(answered);
  }

  const hasAnyAnswer = Object.values(answers).some(a => a.trim().length > 0);

  return (
    <div className="mt-4 border rounded-lg overflow-hidden bg-card">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-amber-50 dark:bg-amber-950/30">
        <MessageCircleQuestion className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" aria-hidden="true" />
        <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Open Questions — Answer to improve output
        </h4>
        {loadingSuggestions && (
          <Loader2 className="h-3.5 w-3.5 ml-auto animate-spin text-amber-500" aria-label="Loading suggestions" />
        )}
      </div>

      <div className="divide-y" role="list">
        {gaps.map((gap, i) => {
          const qSuggestions = suggestions.find(s => s.question === gap)?.suggestions ?? [];

          return (
            <div key={gap} className="px-4 py-3 space-y-2" role="listitem">
              <p className="text-sm font-medium text-foreground">{gap}</p>

              {/* Suggestion chips */}
              {!loadingSuggestions && qSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Answer suggestions">
                  {qSuggestions.map((s, si) => (
                    <button
                      key={si}
                      type="button"
                      onClick={() => setAnswer(i, s)}
                      className={cn(
                        "text-xs px-2.5 py-1 rounded-full border transition-colors",
                        answers[i] === s
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-muted text-muted-foreground hover:text-foreground",
                      )}
                      aria-pressed={answers[i] === s}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Loading chip skeletons */}
              {loadingSuggestions && (
                <div className="flex gap-1.5" aria-hidden="true">
                  {[80, 120, 100].map((w, si) => (
                    <div
                      key={si}
                      className="h-6 rounded-full bg-muted animate-pulse"
                      style={{ width: w }}
                    />
                  ))}
                </div>
              )}

              {/* Answer textarea */}
              <textarea
                value={answers[i] ?? ''}
                onChange={(e) => setAnswer(i, e.target.value)}
                placeholder="Type your answer, or click a suggestion above…"
                rows={2}
                aria-label={`Answer for: ${gap}`}
                className="w-full text-sm px-3 py-2 rounded-md border bg-background resize-none outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
              />
            </div>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t bg-muted/10 flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={!hasAnyAnswer || submitting}
          size="sm"
        >
          {submitting ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden="true" /> Regenerating…</>
          ) : (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" /> Apply answers & Regenerate</>
          )}
        </Button>
      </div>
    </div>
  );
}
