# App Cleanup & Professionalization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove dead code, split the cluttered analyze page into focused routes, wire up the broken evidence dialog, refactor a 879-line component, and standardize loading/status UI across the app.

**Architecture:** Pure frontend refactor — no database changes, no API changes. All changes are in `src/`. The root `lib/` and `server.js` are the only root-level touches (deletion only). Navigation is restructured by adding two new Next.js pages and updating the sidebar.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4, Radix/Shadcn components, Lucide icons, Sonner toasts.

**Note on testing:** This codebase has no test infrastructure. Verification steps are manual (run dev server, navigate to the changed page, confirm it looks right). Do not set up Jest/Vitest as part of this plan — that is out of scope.

---

### Task 1: Delete dead code

**Files:**
- Delete: `server.js`
- Delete: `src/components/obligations/obligations-stats.tsx`

**Step 1: Delete the files**

```bash
rm "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea/server.js"
rm "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea/src/components/obligations/obligations-stats.tsx"
```

**Step 2: Verify nothing imports them**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
grep -r "obligations-stats" src/
grep -r "server\.js" src/ package.json railway.toml
```

Expected: no output (neither file is imported anywhere).

**Step 3: Verify build still passes**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
npm run build
```

Expected: build completes with no errors.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove dead server.js and unused obligations-stats component"
```

---

### Task 2: Update sidebar — rename header and add new nav entries

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`

**Context:** The sidebar currently has 4 nav items. We're adding 2 new ones (Ask Library, Process) and renaming the existing "Analyze & Ask" entry to "Analyze". The header title changes from "Document Analyzer" to "ComplianceA". New icons needed from `lucide-react`: `MessageSquare` for Ask Library, `Layers` for Process.

**Step 1: Read the current file**

Read `src/components/layout/app-sidebar.tsx` in full before editing.

**Step 2: Apply the changes**

Replace the import line and navItems array:

```tsx
import { FileText, Search, MessageSquare, Layers, ClipboardCheck, Settings } from "lucide-react";

const navItems = [
  {
    title: "Documents",
    href: "/documents",
    icon: FileText,
  },
  {
    title: "Analyze",
    href: "/analyze",
    icon: Search,
  },
  {
    title: "Ask Library",
    href: "/ask",
    icon: MessageSquare,
  },
  {
    title: "Process",
    href: "/process",
    icon: Layers,
  },
  {
    title: "Contracts",
    href: "/contracts",
    icon: ClipboardCheck,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
];
```

Replace the header title:

```tsx
// Before:
<h1 className="text-lg font-semibold tracking-tight">
  Document Analyzer
</h1>

// After:
<h1 className="text-lg font-semibold tracking-tight">
  ComplianceA
</h1>
```

**Step 3: Verify manually**

Run `npm run dev`. Open the app. Confirm sidebar shows 6 items with correct labels and the header reads "ComplianceA". Ask Library and Process links will 404 for now — that's expected.

**Step 4: Commit**

```bash
git add src/components/layout/app-sidebar.tsx
git commit -m "feat: update sidebar with new nav structure and ComplianceA branding"
```

---

### Task 3: Simplify /analyze page to Document Analyzer only

**Files:**
- Modify: `src/app/analyze/page.tsx`

**Context:** The current analyze page fetches documents and renders 3 separate card sections. We strip it to just the Document Analyzer section. `AnalyzerSection` takes no props — it handles its own file upload internally.

**Step 1: Replace the full file content**

```tsx
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AnalyzerSection } from "@/components/analyze/analyzer-section";

export default function AnalyzePage() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Analyze</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a document to translate, summarize, extract key points, or generate department to-do lists.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Document Analyzer</CardTitle>
          <CardDescription>
            Upload a document to translate, summarize, extract key points, or generate department to-do lists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnalyzerSection />
        </CardContent>
      </Card>
    </div>
  );
}
```

Note: no `"use client"` needed — `AnalyzerSection` is itself a client component and Next.js handles the boundary automatically.

**Step 2: Verify manually**

Navigate to `/analyze`. Confirm only the Document Analyzer card renders. Upload a file and run an analysis to confirm nothing broke.

**Step 3: Commit**

```bash
git add src/app/analyze/page.tsx
git commit -m "refactor: simplify analyze page to document analyzer only"
```

---

### Task 4: Create /ask page

**Files:**
- Create: `src/app/ask/page.tsx`

**Context:** `AskSection` expects a `documents: Document[]` prop. The new page fetches documents itself, exactly as the old analyze page did. Use a `Skeleton` for the loading state.

**Step 1: Create the file**

```tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AskSection } from "@/components/analyze/ask-section";
import type { Document } from "@/lib/types";

export default function AskPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDocuments() {
      try {
        const res = await fetch("/api/documents");
        if (res.ok) {
          const data = await res.json();
          setDocuments(data.documents || []);
        }
      } catch {
        // AskSection handles empty documents gracefully
      } finally {
        setLoading(false);
      }
    }
    fetchDocuments();
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Ask Library</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Ask questions and get answers with semantic search across your document library.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Ask the Library</CardTitle>
          <CardDescription>
            Ask questions and get answers with semantic search across your document library.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-3/4" />
            </div>
          ) : (
            <AskSection documents={documents} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: Verify manually**

Navigate to `/ask` in the dev server. Confirm the page loads, the skeleton shows briefly, then the Ask section appears. Test asking a question.

**Step 3: Commit**

```bash
git add src/app/ask/page.tsx
git commit -m "feat: add /ask page for Ask Library"
```

---

### Task 5: Create /process page

**Files:**
- Create: `src/app/process/page.tsx`

**Context:** `DeskSection` expects `documents: Document[]`. Same pattern as the ask page.

**Step 1: Create the file**

```tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DeskSection } from "@/components/analyze/desk-section";
import type { Document } from "@/lib/types";

export default function ProcessPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDocuments() {
      try {
        const res = await fetch("/api/documents");
        if (res.ok) {
          const data = await res.json();
          setDocuments(data.documents || []);
        }
      } catch {
        // DeskSection handles empty documents gracefully
      } finally {
        setLoading(false);
      }
    }
    fetchDocuments();
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Process</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Respond to regulator queries, process questionnaires, and review NDAs using your document library.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Process</CardTitle>
          <CardDescription>
            Select a mode: respond to a regulator query with cross-referenced sources, auto-answer a questionnaire, or review an NDA for risks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-3/4" />
            </div>
          ) : (
            <DeskSection documents={documents} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: Verify manually**

Navigate to `/process`. Confirm the page loads and all 3 modes (Regulator Query, Questionnaire, NDA Review) work via the radio switcher.

**Step 3: Commit**

```bash
git add src/app/process/page.tsx
git commit -m "feat: add /process page for regulator queries, questionnaires, and NDA review"
```

---

### Task 6: Refactor desk-section.tsx into sub-components

**Files:**
- Modify: `src/components/analyze/desk-section.tsx`
- Create: `src/components/analyze/regulator-section.tsx`
- Create: `src/components/analyze/questionnaire-section.tsx`
- Create: `src/components/analyze/nda-section.tsx`

**Context:** `desk-section.tsx` is 879 lines with a `mode` state (`"regulator" | "questionnaire" | "nda"`) and a radio group at the top to switch between them. Each mode has its own state, handlers, and JSX that live in one giant component. The split is mechanical — no logic changes.

**Step 1: Read the full file**

Read `src/components/analyze/desk-section.tsx` in full before starting. Identify the exact line ranges where each mode's state, handlers, and JSX begin and end.

**Step 2: Extract regulator-section.tsx**

Identify all state variables, handlers, and JSX that belong exclusively to the `mode === "regulator"` branch. Create `src/components/analyze/regulator-section.tsx`:

```tsx
"use client";

// All imports needed for regulator mode only
// Props: { documents: Document[] }

interface RegulatorSectionProps {
  documents: Document[];
}

export function RegulatorSection({ documents }: RegulatorSectionProps) {
  // All state that was previously inside DeskSection for regulator mode
  // All handlers (handleAnalyze, etc.) for regulator mode
  // The JSX that was rendered when mode === "regulator"
}
```

**Step 3: Extract questionnaire-section.tsx**

Same pattern for questionnaire mode:

```tsx
"use client";

interface QuestionnaireSectionProps {
  documents: Document[];
}

export function QuestionnaireSection({ documents }: QuestionnaireSectionProps) {
  // All state, handlers, JSX for questionnaire mode
}
```

**Step 4: Extract nda-section.tsx**

Same pattern for NDA mode:

```tsx
"use client";

interface NdaSectionProps {
  documents: Document[];
}

export function NdaSection({ documents }: NdaSectionProps) {
  // All state, handlers, JSX for NDA mode
}
```

**Step 5: Slim down desk-section.tsx to orchestrator**

Replace the entire file content with just the mode switcher:

```tsx
"use client";

import { useState } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { RegulatorSection } from "./regulator-section";
import { QuestionnaireSection } from "./questionnaire-section";
import { NdaSection } from "./nda-section";
import type { Document } from "@/lib/types";

interface DeskSectionProps {
  documents: Document[];
}

type DeskMode = "regulator" | "questionnaire" | "nda";

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

      {mode === "regulator" && <RegulatorSection documents={documents} />}
      {mode === "questionnaire" && <QuestionnaireSection documents={documents} />}
      {mode === "nda" && <NdaSection documents={documents} />}
    </div>
  );
}
```

**Step 6: Verify the build**

```bash
npm run build
```

Expected: no TypeScript errors. If there are import errors, check that all types used in the sub-components are imported in each file.

**Step 7: Verify manually**

Navigate to `/process`. Switch between all 3 modes and confirm they all render and function correctly. Test one operation in each mode.

**Step 8: Commit**

```bash
git add src/components/analyze/desk-section.tsx \
        src/components/analyze/regulator-section.tsx \
        src/components/analyze/questionnaire-section.tsx \
        src/components/analyze/nda-section.tsx
git commit -m "refactor: split desk-section into regulator, questionnaire, and nda sub-components"
```

---

### Task 7: Wire EvidenceDialog in contract-card.tsx

**Files:**
- Modify: `src/components/contracts/contract-card.tsx`

**Context:** `EvidenceDialog` is fully built at `src/components/obligations/evidence-dialog.tsx`. Its interface is:

```tsx
interface EvidenceDialogProps {
  obligationId: number | null;  // which obligation to add evidence to
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEvidenceAdded: () => void;  // called after successful POST
}
```

The TODO at line 311 is inside `<ObligationCard>`'s `onAddEvidence` prop, which receives the obligation's `id` (a number). We need to: track which obligation's dialog is open, mount `EvidenceDialog` once in `ContractCard`, and connect the callback.

**Step 1: Read the full file**

Read `src/components/contracts/contract-card.tsx` in full before editing.

**Step 2: Add import**

Add to the existing imports at the top of the file:

```tsx
import { EvidenceDialog } from "../obligations/evidence-dialog";
```

**Step 3: Add state for the evidence dialog**

Inside the `ContractCard` component function, add this state alongside the existing state variables:

```tsx
const [evidenceDialogObligationId, setEvidenceDialogObligationId] = useState<number | null>(null);
```

**Step 4: Replace the TODO callback**

Find line 311 (the TODO):

```tsx
onAddEvidence={() => {
  // TODO: Open evidence dialog
}}
```

Replace with:

```tsx
onAddEvidence={(obId) => {
  setEvidenceDialogObligationId(obId);
}}
```

Note: verify that `ObligationCard`'s `onAddEvidence` prop passes the obligation id. Read `src/components/obligations/obligation-card.tsx` to confirm the call signature — if it passes `id` as the first argument, the above is correct.

**Step 5: Mount EvidenceDialog**

At the end of the `ContractCard` return statement, just before the closing outer `</div>`, add:

```tsx
<EvidenceDialog
  obligationId={evidenceDialogObligationId}
  open={evidenceDialogObligationId !== null}
  onOpenChange={(open) => {
    if (!open) setEvidenceDialogObligationId(null);
  }}
  onEvidenceAdded={() => {
    onObligationUpdate?.();
    setEvidenceDialogObligationId(null);
  }}
/>
```

**Step 6: Verify the build**

```bash
npm run build
```

Expected: no TypeScript errors.

**Step 7: Verify manually**

Navigate to `/contracts`. Open a contract that has obligations. Click "Add Evidence" on an obligation. Confirm the dialog opens, you can select a document and add a note, and submitting it closes the dialog and refreshes the obligation list.

**Step 8: Commit**

```bash
git add src/components/contracts/contract-card.tsx
git commit -m "feat: wire EvidenceDialog to Add Evidence button in contract obligations"
```

---

### Task 8: Create StatusMessage component and use it in analyzer and ask sections

**Files:**
- Create: `src/components/ui/status-message.tsx`
- Modify: `src/components/analyze/analyzer-section.tsx`
- Modify: `src/components/analyze/ask-section.tsx`

**Context:** Both `analyzer-section.tsx` and `ask-section.tsx` have an identical inline ternary for rendering a status `<p>` tag. Extract it to a shared component.

**Step 1: Create the component**

```tsx
// src/components/ui/status-message.tsx

interface StatusMessageProps {
  type: "info" | "success" | "error";
  message: string;
}

export function StatusMessage({ type, message }: StatusMessageProps) {
  const colorClass =
    type === "error"
      ? "text-destructive"
      : type === "success"
      ? "text-green-600 dark:text-green-400"
      : "text-muted-foreground";

  return <p className={`text-sm ${colorClass}`}>{message}</p>;
}
```

**Step 2: Update analyzer-section.tsx**

Add the import:
```tsx
import { StatusMessage } from "@/components/ui/status-message";
```

Replace the status block (currently lines ~203–215):
```tsx
// Before:
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

// After:
{status && <StatusMessage type={status.type} message={status.message} />}
```

**Step 3: Update ask-section.tsx**

Same changes — add import, replace the identical status block (currently lines ~127–139).

**Step 4: Verify the build**

```bash
npm run build
```

**Step 5: Verify manually**

Test an analysis in `/analyze` — trigger an error (e.g., submit without a file) and confirm the status message still renders with the correct color. Do the same in `/ask`.

**Step 6: Commit**

```bash
git add src/components/ui/status-message.tsx \
        src/components/analyze/analyzer-section.tsx \
        src/components/analyze/ask-section.tsx
git commit -m "refactor: extract StatusMessage component, use in analyzer and ask sections"
```

---

### Task 9: Replace plain-text loading states with Skeleton loaders

**Files:**
- Modify: `src/app/documents/page.tsx`
- Modify: `src/components/contracts/contract-list.tsx`
- Modify: `src/components/contracts/upcoming-obligations-section.tsx`

**Context:** Three places show `Loading...` plain text. The `Skeleton` component is at `src/components/ui/skeleton.tsx` — import it as `import { Skeleton } from "@/components/ui/skeleton"`.

**Step 1: Update documents/page.tsx**

Add the Skeleton import to the existing imports in `src/app/documents/page.tsx`.

Find line ~320:
```tsx
// Before:
{loading ? (
  <p className="text-sm text-muted-foreground">Loading documents...</p>
) : (

// After:
{loading ? (
  <div className="space-y-3">
    <Skeleton className="h-20 w-full rounded-lg" />
    <Skeleton className="h-20 w-full rounded-lg" />
    <Skeleton className="h-20 w-full rounded-lg" />
  </div>
) : (
```

**Step 2: Update contract-list.tsx**

Add the Skeleton import.

Find lines ~61–63:
```tsx
// Before:
if (loading) {
  return <div className="text-sm text-muted-foreground">Loading contracts...</div>;
}

// After:
if (loading) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  );
}
```

**Step 3: Update upcoming-obligations-section.tsx**

Add the Skeleton import.

Find lines ~33–39:
```tsx
// Before:
if (loading) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Upcoming Obligations (Next 30 Days)</h3>
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}

// After:
if (loading) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Upcoming Obligations (Next 30 Days)</h3>
      <div className="space-y-2">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    </div>
  );
}
```

**Step 4: Verify the build**

```bash
npm run build
```

**Step 5: Verify manually**

Throttle your network in browser devtools to "Slow 3G". Reload `/documents` and `/contracts`. Confirm skeleton shapes appear instead of plain text during load.

**Step 6: Commit**

```bash
git add src/app/documents/page.tsx \
        src/components/contracts/contract-list.tsx \
        src/components/contracts/upcoming-obligations-section.tsx
git commit -m "feat: replace plain loading text with Skeleton loaders across documents and contracts"
```

---

## Completion Checklist

- [ ] Task 1: `server.js` and `obligations-stats.tsx` deleted, build passes
- [ ] Task 2: Sidebar shows 6 items, header reads "ComplianceA"
- [ ] Task 3: `/analyze` renders only Document Analyzer card
- [ ] Task 4: `/ask` page works, Ask Library functional
- [ ] Task 5: `/process` page works, all 3 modes functional
- [ ] Task 6: `desk-section.tsx` is ~50 lines, 3 sub-components extracted, all modes work
- [ ] Task 7: Add Evidence button opens dialog, evidence can be added
- [ ] Task 8: `StatusMessage` component used in both analyzer and ask sections
- [ ] Task 9: Skeleton loaders on documents page, contracts list, upcoming obligations

## Post-implementation notes

- `/api/admin/migrate-contract-hub` is still live — remove before client launch
- The `/obligations` redirect page is kept intentionally for URL hygiene
- No test infrastructure was added — consider Vitest + React Testing Library as a follow-up
