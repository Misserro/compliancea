# Product Hub Wizard Output Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three issues with the Product Hub wizard Step 4 output: warn about incomplete intake before generating, make AI-generated questions interactive with answer suggestions, and render output as professional formatted documents.

**Architecture:** Three independent surface areas — (1) a client-side completeness check in Step 3, (2) a new `GapQaPanel` component + `suggest-answers` API route for post-gen Q&A, (3) switching `output-section.tsx` from raw-markdown-in-TipTap to `react-markdown` display with TipTap edit-mode toggle.

**Tech Stack:** Next.js 15, React 19, TipTap v3, `react-markdown` + `remark-gfm` (already installed), Lucide React icons, Anthropic Haiku 4.5, Tailwind CSS v4, TypeScript 5.

---

## Context for Implementer

### Key Files

- `src/app/product-hub/[id]/page.tsx` — wizard host page, handles generation streaming, state
- `src/components/product-hub/step3-template-selector.tsx` — template picker before generation
- `src/components/product-hub/step4-output-viewer.tsx` — tab bar + output content, renders `OutputSection`
- `src/components/product-hub/output-section.tsx` — individual section card with TipTap editor
- `src/lib/types.ts` — `TEMPLATE_SECTIONS`, `TEMPLATES`, `TemplateId`, `IntakeForm`, `GeneratedOutputs`

### How generation works

1. User clicks Generate in Step 3 → `page.tsx` calls `POST /api/product-hub/[id]/generate`
2. Server streams NDJSON events: `template_start` → `raw_token` (many) → `template_complete` → `done`
3. `template_complete` carries `{ sections: Record<string,string>, gaps: string[] }` — `gaps` are `⚠️`-prefixed lines extracted from the AI output
4. `output-section.tsx` receives `content` (raw markdown string) and tries to put it in TipTap — **this is what breaks formatting**

### AI question markers

The prompt files instruct the AI to use:
- `⚠️ [text]` for missing required inputs (extracted into `gaps[]` by `parseSections()`)
- `❓ [text]` for assumptions and questions (currently buried in section content, not extracted)

The `open_questions` section always contains both types. The design only surfaces `gaps[]` (the ⚠️ ones) in the Q&A panel since these are already extracted. ❓ items in the prose will render correctly once markdown is fixed.

### Why `react-markdown` instead of TipTap for display

TipTap's `setContent()` accepts HTML or ProseMirror JSON, not raw markdown. The AI returns markdown. Converting markdown → TipTap HTML requires a parser anyway. Since `react-markdown` (with `remark-gfm` for tables) is already in `package.json`, use it for the read view. TipTap is kept only for explicit user-initiated editing.

### Verify changes compile

No test runner is configured. After each task, verify with:
```bash
npx tsc --noEmit
```
If it exits 0 — clean. Fix any errors before committing.

---

## Task 1: Add SECTION_ICONS to types.ts

**Files:**
- Modify: `src/lib/types.ts`

**Step 1: Add the icon mapping constant**

At the bottom of `src/lib/types.ts`, after the `TEMPLATE_SECTIONS` constant, add:

```typescript
// Map section IDs to Lucide icon names for display in output cards
export const SECTION_ICON_NAMES: Record<string, string> = {
  summary: 'FileText',
  executive_summary: 'FileText',
  problem: 'AlertCircle',
  problem_statement: 'AlertCircle',
  business_problem: 'AlertCircle',
  user_personas: 'Users',
  user_stories: 'BookOpen',
  functional_requirements: 'CheckSquare',
  non_functional_requirements: 'Shield',
  risks: 'AlertTriangle',
  risks_dependencies: 'AlertTriangle',
  open_questions: 'HelpCircle',
  kpis: 'TrendingUp',
  success_metrics: 'TrendingUp',
  solution: 'Lightbulb',
  proposed_solution: 'Lightbulb',
  data_model: 'Database',
  api_design: 'Code',
  dependencies: 'GitBranch',
  team_dependencies: 'GitBranch',
  roi_estimation: 'DollarSign',
  scope: 'Maximize',
  out_of_scope: 'XCircle',
  user_flow: 'ArrowRight',
  overview: 'Layers',
};
```

**Step 2: Verify TypeScript**

```bash
cd /path/to/project && npx tsc --noEmit
```

Expected: exit 0, no errors.

**Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add SECTION_ICON_NAMES mapping to types"
```

---

## Task 2: Rewrite output-section.tsx — react-markdown display + edit toggle

**Files:**
- Modify: `src/components/product-hub/output-section.tsx`

This is the core rendering fix. Replace the always-on TipTap editor with:
- **View mode** (default): `react-markdown` + `remark-gfm` with `prose` styling — renders headers, tables, lists correctly
- **Edit mode** (user-initiated): simple `<textarea>` for raw markdown editing
- **Section header**: Lucide icon (resolved from `SECTION_ICON_NAMES`) + label

**Step 1: Replace the entire file**

```tsx
"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { RotateCcw, Pencil, Check, X } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SECTION_ICON_NAMES } from "@/lib/types";

interface OutputSectionProps {
  sectionId: string;
  label: string;
  content: string;
  streaming: boolean;
  gaps: string[];
  onRegenerate: (sectionId: string) => void;
  onChange: (sectionId: string, content: string) => void;
}

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

  // Resolve icon component from string name
  const iconName = SECTION_ICON_NAMES[sectionId] ?? 'FileText';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = (LucideIcons as any)[iconName] as React.ElementType ?? LucideIcons.FileText;

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
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={cancelEdit}>
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
          {gaps.map((gap, i) => (
            <div key={i} className="flex gap-2 p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
              <span>⚠️</span>
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
```

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: exit 0. If you see `LucideIcons` import errors, the `import * as LucideIcons` pattern may need adjustment — use the exact named imports or a lookup table instead (see note below).

> **Note on icon lookup:** If dynamic icon lookup via `(LucideIcons as any)[iconName]` causes issues, replace with an explicit switch/map:
> ```tsx
> import { FileText, AlertCircle, Users, BookOpen, CheckSquare, Shield,
>   AlertTriangle, HelpCircle, TrendingUp, Lightbulb, Database, Code,
>   GitBranch, DollarSign, Maximize, XCircle, ArrowRight, Layers } from "lucide-react";
>
> const SECTION_ICON_MAP: Record<string, React.ElementType> = {
>   summary: FileText, executive_summary: FileText,
>   problem: AlertCircle, problem_statement: AlertCircle, business_problem: AlertCircle,
>   user_personas: Users, user_stories: BookOpen,
>   functional_requirements: CheckSquare, non_functional_requirements: Shield,
>   risks: AlertTriangle, risks_dependencies: AlertTriangle,
>   open_questions: HelpCircle, kpis: TrendingUp, success_metrics: TrendingUp,
>   solution: Lightbulb, proposed_solution: Lightbulb,
>   data_model: Database, api_design: Code,
>   dependencies: GitBranch, team_dependencies: GitBranch,
>   roi_estimation: DollarSign, scope: Maximize,
>   out_of_scope: XCircle, user_flow: ArrowRight, overview: Layers,
> };
> const IconComponent = SECTION_ICON_MAP[sectionId] ?? FileText;
> ```
> Use this explicit map if TypeScript complains. It's cleaner anyway.

**Step 3: Commit**

```bash
git add src/components/product-hub/output-section.tsx
git commit -m "feat: render output sections with react-markdown and section icons"
```

---

## Task 3: Add skeleton loader to step4-output-viewer.tsx

**Files:**
- Modify: `src/components/product-hub/step4-output-viewer.tsx`

Replace the `<pre>` raw streaming text dump with skeleton cards that show real section structure while generating.

**Step 1: Replace the streaming placeholder block**

Current code in `step4-output-viewer.tsx` (lines 64–69):
```tsx
{isStreaming && !templateOutput ? (
  // Raw streaming view before first template_complete
  <div className="border rounded-lg p-4 bg-muted/20 min-h-[200px]">
    <p className="text-xs text-muted-foreground mb-2 font-medium">Generating {templateDef?.name}…</p>
    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{rawText}</pre>
  </div>
) : templateOutput ? (
```

Replace with:
```tsx
{isStreaming && !templateOutput ? (
  // Skeleton loader — shows section structure while AI generates
  <div className="space-y-3">
    <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
      Generating {templateDef?.name}…
    </p>
    {sections.map(section => (
      <div key={section.id} className="border rounded-lg overflow-hidden bg-card animate-pulse">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/20">
          <div className="h-4 w-4 rounded bg-muted-foreground/20" />
          <div className="h-3.5 w-32 rounded bg-muted-foreground/20" />
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="h-3 w-full rounded bg-muted-foreground/10" />
          <div className="h-3 w-5/6 rounded bg-muted-foreground/10" />
          <div className="h-3 w-4/6 rounded bg-muted-foreground/10" />
        </div>
      </div>
    ))}
  </div>
) : templateOutput ? (
```

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: exit 0.

**Step 3: Manual browser check**

Start the dev server (`npm run dev`), open a Product Hub feature, navigate to Step 3, click Generate. You should see:
- Skeleton cards with correct section names while generating
- Real formatted content (headers, bullets, tables) once `template_complete` fires
- No raw `<pre>` text visible

**Step 4: Commit**

```bash
git add src/components/product-hub/step4-output-viewer.tsx
git commit -m "feat: replace streaming pre dump with structured skeleton loader"
```

---

## Task 4: Add completeness check banner to step3-template-selector.tsx

**Files:**
- Modify: `src/components/product-hub/step3-template-selector.tsx`

**Step 1: Add `intakeForm` prop and completeness check**

The component currently does not receive the intake form. We need to add it and pass it from `page.tsx`.

Replace the component's interface and function signature:

```tsx
import { AlertTriangle } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TEMPLATES, type TemplateId, type IntakeForm } from "@/lib/types";

interface Step3TemplateSelectorProps {
  selectedTemplates: TemplateId[];
  generating: boolean;
  intakeForm: IntakeForm;
  onChange: (templates: TemplateId[]) => void;
  onBack: () => void;
  onGenerate: () => void;
}

function getMissingFields(intake: IntakeForm): string[] {
  const missing: string[] = [];
  if (!intake.sectionA.problemStatement?.trim()) missing.push('Problem Statement');
  if (!intake.sectionB.featureDescription?.trim()) missing.push('Feature Description');
  if (!intake.sectionC.kpis?.trim()) missing.push('Success Metrics (KPIs)');
  return missing;
}

export function Step3TemplateSelector({
  selectedTemplates, generating, intakeForm, onChange, onBack, onGenerate
}: Step3TemplateSelectorProps) {
  function toggle(id: TemplateId) {
    onChange(
      selectedTemplates.includes(id)
        ? selectedTemplates.filter(t => t !== id)
        : [...selectedTemplates, id]
    );
  }

  const missingFields = getMissingFields(intakeForm);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold">Select Output Templates</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Choose one or more documents to generate. Each will be a separate tab in the output view.
        </p>
      </div>

      {/* Completeness warning */}
      {missingFields.length > 0 && (
        <div className="flex gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Incomplete intake form</p>
            <p className="text-xs mt-0.5 text-amber-700 dark:text-amber-400">
              These fields are empty and may produce incomplete output:{' '}
              <span className="font-medium">{missingFields.join(', ')}</span>.
            </p>
            <button
              onClick={onBack}
              className="text-xs mt-1 underline underline-offset-2 hover:no-underline"
            >
              Go back to fill them
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TEMPLATES.map(t => {
          const selected = selectedTemplates.includes(t.id);
          return (
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              disabled={generating}
              className={cn(
                "text-left p-4 rounded-lg border-2 transition-all space-y-1",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/20 hover:border-primary/40 bg-background",
                generating && "opacity-50 cursor-not-allowed",
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{t.name}</p>
                <div className={cn(
                  "h-4 w-4 rounded border-2 flex-shrink-0 transition-colors",
                  selected ? "bg-primary border-primary" : "border-muted-foreground/40",
                )} />
              </div>
              <p className="text-[11px] text-primary/70 font-medium">{t.audience}</p>
              <p className="text-xs text-muted-foreground">{t.description}</p>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={onBack} disabled={generating}>← Back</Button>
        <Button
          onClick={onGenerate}
          disabled={selectedTemplates.length === 0 || generating}
          className="min-w-36"
        >
          {generating ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</>
          ) : (
            `Generate ${selectedTemplates.length > 0 ? `(${selectedTemplates.length})` : ''}`
          )}
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Pass `intakeForm` prop from page.tsx**

In `src/app/product-hub/[id]/page.tsx`, find the `Step3TemplateSelector` usage (around line 336):

```tsx
{currentStep === 3 && (
  <Step3TemplateSelector
    selectedTemplates={selectedTemplates}
    generating={generating}
    onChange={handleTemplatesChange}
    onBack={() => setCurrentStep(1)}
    onGenerate={handleGenerate}
  />
)}
```

Change to:
```tsx
{currentStep === 3 && (
  <Step3TemplateSelector
    selectedTemplates={selectedTemplates}
    generating={generating}
    intakeForm={intakeForm}
    onChange={handleTemplatesChange}
    onBack={() => setCurrentStep(1)}
    onGenerate={handleGenerate}
  />
)}
```

**Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: exit 0.

**Step 4: Commit**

```bash
git add src/components/product-hub/step3-template-selector.tsx src/app/product-hub/[id]/page.tsx
git commit -m "feat: add intake completeness check banner in step 3"
```

---

## Task 5: Create suggest-answers API route

**Files:**
- Create: `src/app/api/product-hub/[id]/suggest-answers/route.ts`

This endpoint receives extracted gaps and returns AI-suggested answers using Haiku.

**Step 1: Create the file**

```typescript
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ensureDb } from "@/lib/server-utils";
import { getProductFeature } from "@/lib/db-imports";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

interface SuggestAnswersBody {
  gaps: string[];
  intakeSummary: string;
}

export async function POST(req: NextRequest, { params }: Params) {
  await ensureDb();
  const { id } = await params;

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  const feature = getProductFeature(Number(id));
  if (!feature) return Response.json({ error: 'Not found' }, { status: 404 });

  const body: SuggestAnswersBody = await req.json();
  const { gaps, intakeSummary } = body;

  if (!gaps || gaps.length === 0) {
    return Response.json({ suggestions: [] });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const questionsText = gaps
    .slice(0, 10) // cap at 10 questions to limit token cost
    .map((g, i) => `${i + 1}. ${g}`)
    .join('\n');

  const prompt = `You are helping a product manager fill in gaps in a product requirements document.

Feature context:
${intakeSummary}

For each question below, generate exactly 2-3 short, plausible answer suggestions (1-2 sentences each) that a product manager might give. Base them on the feature context above.

Questions:
${questionsText}

Respond ONLY with valid JSON in this exact format (no markdown, no preamble):
[
  {
    "question": "exact question text from above",
    "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"]
  }
]`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '[]';

    // Strip any markdown code fences if present
    const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/```$/m, '').trim();
    const parsed = JSON.parse(clean);

    return Response.json({ suggestions: parsed });
  } catch (e) {
    // Degrade gracefully — return empty suggestions, panel still renders without chips
    console.error('suggest-answers error:', e);
    return Response.json({ suggestions: [] });
  }
}
```

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: exit 0.

**Step 3: Commit**

```bash
git add src/app/api/product-hub/[id]/suggest-answers/route.ts
git commit -m "feat: add suggest-answers API route for Q&A panel"
```

---

## Task 6: Create GapQaPanel component

**Files:**
- Create: `src/components/product-hub/gap-qa-panel.tsx`

**Step 1: Create the file**

```tsx
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
  gaps: string[];                          // raw gap strings from AI (⚠️ prefix already stripped)
  suggestions: QuestionSuggestion[];       // AI-generated suggestions per gap
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
        <MessageCircleQuestion className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Open Questions — Answer to improve output
        </h4>
        {loadingSuggestions && (
          <Loader2 className="h-3.5 w-3.5 ml-auto animate-spin text-amber-500" />
        )}
      </div>

      <div className="divide-y">
        {gaps.map((gap, i) => {
          const qSuggestions = suggestions.find(s => s.question === gap)?.suggestions ?? [];

          return (
            <div key={i} className="px-4 py-3 space-y-2">
              <p className="text-sm font-medium text-foreground">{gap}</p>

              {/* Suggestion chips */}
              {!loadingSuggestions && qSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {qSuggestions.map((s, si) => (
                    <button
                      key={si}
                      onClick={() => setAnswer(i, s)}
                      className={cn(
                        "text-xs px-2.5 py-1 rounded-full border transition-colors",
                        answers[i] === s
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-muted text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Loading chip skeletons */}
              {loadingSuggestions && (
                <div className="flex gap-1.5">
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
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Regenerating…</>
          ) : (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Apply answers & Regenerate</>
          )}
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: exit 0.

**Step 3: Commit**

```bash
git add src/components/product-hub/gap-qa-panel.tsx
git commit -m "feat: add GapQaPanel component for interactive Q&A"
```

---

## Task 7: Wire GapQaPanel into step4-output-viewer.tsx

**Files:**
- Modify: `src/components/product-hub/step4-output-viewer.tsx`

Add `GapQaPanel` below the section content for the active template when it has gaps.

**Step 1: Update props interface and render**

Replace the entire `step4-output-viewer.tsx`:

```tsx
"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OutputSection } from "./output-section";
import { GapQaPanel } from "./gap-qa-panel";
import { TEMPLATES, TEMPLATE_SECTIONS, type TemplateId, type GeneratedOutputs } from "@/lib/types";

interface QuestionSuggestion {
  question: string;
  suggestions: string[];
}

interface Step4OutputViewerProps {
  selectedTemplates: TemplateId[];
  outputs: GeneratedOutputs;
  streamingTemplate: TemplateId | null;
  streamingRawText: Record<TemplateId, string>;
  gapSuggestions: Record<TemplateId, QuestionSuggestion[]>;
  loadingSuggestions: Record<TemplateId, boolean>;
  submittingAnswers: boolean;
  onRegenerate: (template: TemplateId, section?: string) => void;
  onOutputChange: (template: TemplateId, sectionId: string, content: string) => void;
  onRegenerateAll: () => void;
  onAnswerGaps: (template: TemplateId, answers: { question: string; answer: string }[]) => void;
}

export function Step4OutputViewer({
  selectedTemplates, outputs, streamingTemplate, streamingRawText,
  gapSuggestions, loadingSuggestions, submittingAnswers,
  onRegenerate, onOutputChange, onRegenerateAll, onAnswerGaps,
}: Step4OutputViewerProps) {
  const [activeTab, setActiveTab] = useState<TemplateId>(selectedTemplates[0]);

  const templateDef = TEMPLATES.find(t => t.id === activeTab);
  const sections = TEMPLATE_SECTIONS[activeTab] ?? [];
  const templateOutput = outputs[activeTab];
  const isStreaming = streamingTemplate === activeTab;
  const gaps = templateOutput?.gaps ?? [];

  return (
    <div className="space-y-4">
      {/* Tab bar + Regenerate All */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 border-b flex-1">
          {selectedTemplates.map(tid => {
            const def = TEMPLATES.find(t => t.id === tid);
            return (
              <button
                key={tid}
                onClick={() => setActiveTab(tid)}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  activeTab === tid
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {def?.name ?? tid}
                {streamingTemplate === tid && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                )}
                {outputs[tid]?.gaps?.length > 0 && streamingTemplate !== tid && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                )}
              </button>
            );
          })}
        </div>
        <Button variant="outline" size="sm" onClick={onRegenerateAll} disabled={!!streamingTemplate}>
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Regenerate All
        </Button>
      </div>

      {/* Active template content */}
      {isStreaming && !templateOutput ? (
        // Skeleton loader — shows section structure while AI generates
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Generating {templateDef?.name}…
          </p>
          {sections.map(section => (
            <div key={section.id} className="border rounded-lg overflow-hidden bg-card animate-pulse">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/20">
                <div className="h-4 w-4 rounded bg-muted-foreground/20" />
                <div className="h-3.5 w-32 rounded bg-muted-foreground/20" />
              </div>
              <div className="px-4 py-3 space-y-2">
                <div className="h-3 w-full rounded bg-muted-foreground/10" />
                <div className="h-3 w-5/6 rounded bg-muted-foreground/10" />
                <div className="h-3 w-4/6 rounded bg-muted-foreground/10" />
              </div>
            </div>
          ))}
        </div>
      ) : templateOutput ? (
        <>
          <div className="space-y-3">
            {sections.map(section => (
              <OutputSection
                key={section.id}
                sectionId={section.id}
                label={section.label}
                content={templateOutput.sections[section.id] ?? ''}
                streaming={isStreaming}
                gaps={templateOutput.gaps ?? []}
                onRegenerate={(sid) => onRegenerate(activeTab, sid)}
                onChange={(sid, content) => onOutputChange(activeTab, sid, content)}
              />
            ))}
          </div>

          {/* Q&A panel — only shown when there are gaps */}
          {gaps.length > 0 && (
            <GapQaPanel
              gaps={gaps}
              suggestions={gapSuggestions[activeTab] ?? []}
              loadingSuggestions={loadingSuggestions[activeTab] ?? false}
              onSubmit={(answers) => onAnswerGaps(activeTab, answers)}
              submitting={submittingAnswers}
            />
          )}
        </>
      ) : (
        <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
          No output yet. Click Generate in Step 3.
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: exit 0. If `page.tsx` now has prop mismatch errors on `Step4OutputViewer`, fix them in Task 8.

**Step 3: Commit**

```bash
git add src/components/product-hub/step4-output-viewer.tsx
git commit -m "feat: wire GapQaPanel into output viewer, add gap indicator on tabs"
```

---

## Task 8: Wire suggest-answers and Q&A state into page.tsx

**Files:**
- Modify: `src/app/product-hub/[id]/page.tsx`

Add state for suggestions and loading, call suggest-answers after `template_complete`, handle answer submission.

**Step 1: Add new state variables**

In `page.tsx`, after the existing state declarations (around line 34), add:

```typescript
const [gapSuggestions, setGapSuggestions] = useState<Record<string, { question: string; suggestions: string[] }[]>>({});
const [loadingSuggestions, setLoadingSuggestions] = useState<Record<string, boolean>>({});
const [submittingAnswers, setSubmittingAnswers] = useState(false);
```

**Step 2: Add fetchSuggestions helper**

After `handleOutputChange` function, add:

```typescript
async function fetchSuggestions(templateId: TemplateId, gaps: string[]) {
  if (gaps.length === 0) return;
  setLoadingSuggestions(prev => ({ ...prev, [templateId]: true }));

  // Build a brief intake summary for context
  const intakeSummary = [
    intakeForm.sectionA.problemStatement,
    intakeForm.sectionB.featureDescription,
    intakeForm.sectionC.kpis,
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch(`/api/product-hub/${id}/suggest-answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gaps, intakeSummary }),
    });
    if (res.ok) {
      const data = await res.json();
      setGapSuggestions(prev => ({ ...prev, [templateId]: data.suggestions ?? [] }));
    }
  } catch {
    // Silently degrade — panel shows without chips
  } finally {
    setLoadingSuggestions(prev => ({ ...prev, [templateId]: false }));
  }
}
```

**Step 3: Call fetchSuggestions after template_complete in handleGenerate**

Find the `template_complete` event handler in `handleGenerate` (around line 153):

```typescript
} else if (event.type === 'template_complete') {
  setOutputs(prev => ({
    ...prev,
    [event.template]: { sections: event.sections, gaps: event.gaps ?? [] },
  }));
  setStreamingTemplate(null);
}
```

Change to:

```typescript
} else if (event.type === 'template_complete') {
  const gaps: string[] = event.gaps ?? [];
  setOutputs(prev => ({
    ...prev,
    [event.template]: { sections: event.sections, gaps },
  }));
  setStreamingTemplate(null);
  // Fetch AI suggestions for any gaps found
  if (gaps.length > 0) {
    fetchSuggestions(event.template as TemplateId, gaps);
  }
}
```

**Step 4: Add handleAnswerGaps function**

After `fetchSuggestions`, add:

```typescript
async function handleAnswerGaps(template: TemplateId, answers: { question: string; answer: string }[]) {
  if (!feature || answers.length === 0) return;
  setSubmittingAnswers(true);

  // Format answers as structured text to append to free_context
  const answersText = answers
    .map(a => `Q: ${a.question}\nA: ${a.answer}`)
    .join('\n\n');

  const existingContext = feature.free_context ?? '';
  const separator = existingContext.trim() ? '\n\n---\n\n' : '';
  const newContext = existingContext + separator + '## Answers to open questions\n\n' + answersText;

  // Save updated context and regenerate
  updateFeature({ free_context: newContext });

  // Wait for save then regenerate
  await new Promise(resolve => setTimeout(resolve, 500));
  setSubmittingAnswers(false);
  handleGenerate();
}
```

**Step 5: Update Step4OutputViewer props**

In the JSX (around line 345), update the `Step4OutputViewer` usage to pass the new props:

```tsx
{currentStep === 4 && (
  <Step4OutputViewer
    selectedTemplates={selectedTemplates.length > 0 ? selectedTemplates : Object.keys(outputs) as TemplateId[]}
    outputs={outputs}
    streamingTemplate={streamingTemplate}
    streamingRawText={streamingRawText as Record<TemplateId, string>}
    gapSuggestions={gapSuggestions as Record<TemplateId, { question: string; suggestions: string[] }[]>}
    loadingSuggestions={loadingSuggestions as Record<TemplateId, boolean>}
    submittingAnswers={submittingAnswers}
    onRegenerate={handleRegenerate}
    onOutputChange={handleOutputChange}
    onRegenerateAll={handleGenerate}
    onAnswerGaps={handleAnswerGaps}
  />
)}
```

**Step 6: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: exit 0. Fix any remaining type mismatches.

**Step 7: Full manual test**

1. `npm run dev`
2. Open a Product Hub feature with a complete intake form
3. Go to Step 3 — should see no warning banner
4. Empty out the Problem Statement field in Step 1, return to Step 3 — should see amber warning banner listing "Problem Statement"
5. Generate a PRD — should see skeleton cards while generating, then rendered markdown (headers, bullets, tables)
6. If gaps appear, should see Q&A panel below the sections with suggestion chips
7. Answer a question and click "Apply answers & Regenerate" — should regenerate with answers incorporated

**Step 8: Commit**

```bash
git add src/app/product-hub/[id]/page.tsx
git commit -m "feat: wire gap Q&A suggestions and answer submission in wizard page"
```

---

## Task 9: Final build check and cleanup

**Step 1: Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: exit 0.

**Step 2: Next.js build check**

```bash
npm run build
```

Expected: successful build, no errors. Address any warnings about missing keys, unused variables, etc.

**Step 3: Verify dark mode**

Toggle to dark mode in the app. Check:
- Amber warning banners have correct dark mode colors
- Section cards render correctly
- Prose content (markdown) inverts correctly with `dark:prose-invert`

**Step 4: Commit cleanup if needed**

If any small fixes were needed:

```bash
git add -A
git commit -m "fix: resolve build warnings from wizard output improvements"
```

---

## Summary of New/Changed Files

| File | Status |
|---|---|
| `src/lib/types.ts` | Modified — added `SECTION_ICON_NAMES` |
| `src/components/product-hub/output-section.tsx` | Rewritten — react-markdown + edit toggle + icons |
| `src/components/product-hub/step4-output-viewer.tsx` | Rewritten — skeleton loader + GapQaPanel wiring |
| `src/components/product-hub/step3-template-selector.tsx` | Modified — completeness check banner |
| `src/components/product-hub/gap-qa-panel.tsx` | Created — new Q&A panel component |
| `src/app/api/product-hub/[id]/suggest-answers/route.ts` | Created — Haiku suggestion endpoint |
| `src/app/product-hub/[id]/page.tsx` | Modified — suggestion state, fetchSuggestions, handleAnswerGaps |

**New dependencies**: None — `react-markdown` and `remark-gfm` are already in `package.json`.
