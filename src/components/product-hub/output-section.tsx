"use client";

import { useState, type ElementType } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { RotateCcw, Pencil, Check, X } from "lucide-react";
import { FileText, AlertCircle, Users, BookOpen, CheckSquare, Shield,
  AlertTriangle, HelpCircle, TrendingUp, Lightbulb, Database, Code,
  GitBranch, DollarSign, Maximize, XCircle, ArrowRight, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface OutputSectionProps {
  sectionId: string;
  label: string;
  content: string;
  streaming: boolean;
  gaps: string[];
  onRegenerate: (sectionId: string) => void;
  onChange: (sectionId: string, content: string) => void;
}

const SECTION_ICON_MAP: Record<string, ElementType> = {
  summary: FileText, executive_summary: FileText,
  problem: AlertCircle, problem_statement: AlertCircle, business_problem: AlertCircle,
  user_personas: Users, user_stories: BookOpen,
  functional_requirements: CheckSquare, non_functional_requirements: Shield,
  risks: AlertTriangle, risks_dependencies: AlertTriangle,
  open_questions: HelpCircle, kpis: TrendingUp, success_metrics: TrendingUp,
  solution: Lightbulb, proposed_solution: Lightbulb,
  data_model: Database, api_design: Code,
  dependencies: GitBranch, team_dependencies: GitBranch,
  roi_estimation: DollarSign, scope: Maximize,
  out_of_scope: XCircle, user_flow: ArrowRight, overview: Layers,
};

export function OutputSection({
  sectionId, label, content, streaming, gaps, onRegenerate, onChange,
}: OutputSectionProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function startEdit() {
    setDraft(content);
    setEditing(true);
  }

  function saveEdit() {
    onChange(sectionId, draft);
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
  }

  const IconComponent = SECTION_ICON_MAP[sectionId] ?? FileText;
  const isOpenQuestions = sectionId === 'open_questions';

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/20">
        <div className="flex items-center gap-2">
          <IconComponent className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <h4 className="text-sm font-semibold">{label}</h4>
        </div>
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={saveEdit}>
                <Check className="h-3 w-3 mr-1" /> Save
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={cancelEdit} aria-label="Cancel edit">
                <X className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={startEdit}
                disabled={streaming}
              >
                <Pencil className="h-3 w-3 mr-1" /> Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onRegenerate(sectionId)}
                disabled={streaming}
              >
                <RotateCcw className="h-3 w-3 mr-1" /> Regenerate
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Gap warnings (open_questions section only) */}
      {isOpenQuestions && gaps.length > 0 && !editing && (
        <div className="px-4 pt-3 space-y-1">
          {gaps.map((gap) => (
            <div key={gap} className="flex gap-2 p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
              <span aria-hidden="true">⚠️</span>
              <span>{gap}</span>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full px-4 py-3 text-sm font-mono resize-none outline-none bg-background min-h-[200px]"
          rows={Math.max(8, draft.split('\n').length + 2)}
          aria-label={`Edit ${label}`}
        />
      ) : (
        <div className={cn(
          "px-4 py-3 prose prose-sm dark:prose-invert max-w-none",
          streaming && "animate-pulse opacity-70",
        )}>
          {content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          ) : (
            <p className="text-muted-foreground text-xs italic">No content generated for this section.</p>
          )}
        </div>
      )}
    </div>
  );
}
