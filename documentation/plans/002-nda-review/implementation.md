# NDA Review Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an "NDA Review" option to the Cross-Reference & Questionnaire section that lets users upload an NDA, pick a jurisdiction, and receive a rendered risk analysis report.

**Architecture:** A third radio option ("NDA Review") is added to `DeskSection`. A new `NdaReviewMode` component handles the form and result display. A new API route `/api/nda/analyze` reads the prompt file from disk, fills in jurisdiction and document text, calls Anthropic, and returns raw markdown. The result is rendered in-app using `react-markdown` + `remark-gfm`, with an Export as DOCX button.

**Tech Stack:** Next.js 15, TypeScript, Anthropic SDK, react-markdown, remark-gfm, shadcn/ui, Tailwind v4

---

## Task 1: Install markdown rendering dependencies

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `package-lock.json` (auto-generated)

**Step 1: Install packages**

```bash
npm install react-markdown remark-gfm
```

Run from: `/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea`

**Step 2: Install TypeScript types (if needed)**

These packages ship their own types — no `@types/...` packages required.

**Step 3: Verify install**

```bash
node -e "require('react-markdown'); require('remark-gfm'); console.log('OK')"
```

Expected output: `OK`

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-markdown and remark-gfm for NDA report rendering"
```

---

## Task 2: Add `NdaAnalysisResult` type

**Files:**
- Modify: `src/lib/types.ts` (append at end of file)

**Step 1: Append the new type**

Open `src/lib/types.ts` and add at the very end:

```typescript
export interface NdaAnalysisResult {
  markdown: string;
  tokenUsage?: TokenUsage;
}
```

`TokenUsage` is already defined in this file at line 91.

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add NdaAnalysisResult type"
```

---

## Task 3: Create the NDA analysis API route

**Files:**
- Create: `src/app/api/nda/analyze/route.ts`

**Context:** The NDA prompt lives at the project root: `nda-analysis-prompt.md`. In Next.js API routes, `process.cwd()` returns the project root. The prompt has two placeholders: `{JURISDICTION}` and `{NDA_TEXT}`. The route should NOT call `ensureDb()` — this endpoint is stateless (no database interaction).

**Step 1: Create directory and file**

Create `src/app/api/nda/analyze/route.ts` with this content:

```typescript
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";
import {
  extractTextFromBuffer,
  guessType,
  guessTypeFromMime,
} from "@/lib/server-utils";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set." },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();

    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "Missing multipart field: file" },
        { status: 400 }
      );
    }

    const jurisdiction = (formData.get("jurisdiction") as string | null)?.trim();
    if (!jurisdiction) {
      return NextResponse.json(
        { error: "Missing multipart field: jurisdiction" },
        { status: 400 }
      );
    }

    // Determine file type
    const name = file.name.toLowerCase();
    const mime = file.type.toLowerCase();
    let kind = guessType(name);
    if (!kind) kind = guessTypeFromMime(mime);
    if (!kind) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF or DOCX." },
        { status: 400 }
      );
    }

    // Extract text from the uploaded NDA
    const buffer = Buffer.from(await file.arrayBuffer());
    const ndaText = await extractTextFromBuffer(buffer, kind);
    if (!ndaText) {
      return NextResponse.json(
        { error: "Could not extract any text from the uploaded file." },
        { status: 400 }
      );
    }

    // Read the NDA analysis prompt from disk and fill placeholders
    const promptTemplatePath = path.join(process.cwd(), "nda-analysis-prompt.md");
    const promptTemplate = await fs.readFile(promptTemplatePath, "utf-8");
    const prompt = promptTemplate
      .replaceAll("{JURISDICTION}", jurisdiction)
      .replaceAll("{NDA_TEXT}", ndaText);

    // Call Anthropic
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const modelName = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

    const message = await anthropic.messages.create({
      model: modelName,
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const markdown = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");

    const inputTokens = message.usage?.input_tokens || 0;
    const outputTokens = message.usage?.output_tokens || 0;

    return NextResponse.json({
      markdown,
      tokenUsage: {
        claude: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
          model: "sonnet",
        },
      },
    });
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode || 500;
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/app/api/nda/analyze/route.ts
git commit -m "feat: add /api/nda/analyze route for NDA risk analysis"
```

---

## Task 4: Add `NdaReviewMode` to `DeskSection`

**Files:**
- Modify: `src/components/analyze/desk-section.tsx`

**Context:** `desk-section.tsx` currently has:
- `type DeskMode = "regulator" | "questionnaire";` at line 33
- `RadioGroup` with two options at lines 46–59
- A conditional rendering `if mode === "regulator"` / else at lines 63–68

**Step 1: Add new imports at the top of the file**

After the existing import block (after line 27 `import type { ... } from "@/lib/types";`), add:

```typescript
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { NdaAnalysisResult } from "@/lib/types";
```

**Step 2: Extend the `DeskMode` type**

Change line 33:
```typescript
// Before:
type DeskMode = "regulator" | "questionnaire";

// After:
type DeskMode = "regulator" | "questionnaire" | "nda";
```

**Step 3: Add the third radio option in `DeskSection`**

In the `RadioGroup` block (around lines 46–59), add a third `RadioGroupItem` after the existing two:

```tsx
<div className="flex items-center gap-2">
  <RadioGroupItem value="nda" id="mode-nda" />
  <Label htmlFor="mode-nda" className="cursor-pointer">
    NDA Review
  </Label>
</div>
```

**Step 4: Update the conditional rendering**

Change lines 63–68 from:
```tsx
{mode === "regulator" ? (
  <RegulatorMode documents={documents} />
) : (
  <QuestionnaireMode documents={documents} />
)}
```

To:
```tsx
{mode === "regulator" ? (
  <RegulatorMode documents={documents} />
) : mode === "questionnaire" ? (
  <QuestionnaireMode documents={documents} />
) : (
  <NdaReviewMode />
)}
```

**Step 5: Add the `NdaReviewMode` component**

Append this component at the very end of `desk-section.tsx`, after the closing brace of `QuestionnaireMode`:

```tsx
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
```

**Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 7: Verify Next.js build succeeds**

```bash
npm run build
```

Expected: successful build with no errors.

**Step 8: Commit**

```bash
git add src/components/analyze/desk-section.tsx
git commit -m "feat: add NDA Review mode to Cross-Reference & Questionnaire section"
```

---

## Task 5: Smoke-test the feature manually

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Navigate to the Analyze & Ask page**

Open: `http://localhost:3000/analyze`

**Step 3: Test the NDA Review mode**

1. Click "NDA Review" in the Cross-Reference & Questionnaire section.
2. Verify the NDA Review form appears (file input, jurisdiction dropdown, Review NDA button).
3. Select "Other" in the jurisdiction dropdown — verify the custom input field appears.
4. Select back to "Poland" — verify the custom input field disappears.
5. Click "Review NDA" with no file selected — verify error: "Please select a PDF or DOCX file."
6. Select a file but no jurisdiction — verify error: "Please select a jurisdiction."
7. Upload a real NDA PDF, select a jurisdiction, click "Review NDA".
8. Verify the status shows "Analyzing NDA..." while loading.
9. Verify the result renders with styled markdown (tables, headings, risk badges).
10. Click "Export as DOCX" and verify the file downloads.

**Step 4: Verify other modes still work**

Switch to "Regulator Query" and "Questionnaire" — verify they still render correctly.

---

## Final commit summary

After all tasks pass, the git log should show:
```
feat: add NDA Review mode to Cross-Reference & Questionnaire section
feat: add /api/nda/analyze route for NDA risk analysis
feat: add NdaAnalysisResult type
chore: add react-markdown and remark-gfm for NDA report rendering
docs: add NDA review feature design document
```
