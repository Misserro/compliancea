# Contract Manual Creation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give users a choice between AI-assisted and manual contract creation in the "Add New Contract" dialog, with a full-page form at `/contracts/new` for filling in metadata and obligations one by one.

**Architecture:** Backend changes land first (DB layer, then API routes) so each is independently testable before the UI depends on them. The dialog gains a second upload path and a new `"uploading-manual"` step. The new page is a Server Component shell wrapping a `"use client"` form component that uses `useSearchParams()`, required by Next.js App Router.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, shadcn/ui (`Card`), SQLite via `lib/db.js`

**Spec:** `docs/superpowers/specs/2026-03-15-contract-manual-creation-design.md`

---

## Chunk 1: Backend DB and API changes

### Task 1: Extend `lib/db.js` — `insertObligation` and `updateContractMetadata`

**Files:**
- Modify: `lib/db.js` (lines ~986–994 for `insertObligation`, lines ~1251–1275 for `updateContractMetadata`)

**What to know before starting:**
- `insertObligation` currently has 19 columns, 19 `?` placeholders, and 19 values. `department` is added at position 14 (after `category`) — match exactly or SQLite will write the wrong values to the wrong columns silently.
- `updateContractMetadata` currently has 5 `allowedFields`. Adding `"name"`, `"status"`, `"category"`, `"doc_type"` allows the PATCH route to tag newly uploaded documents as contracts (via `doc_type = 'contract'`). Without this, `getContractById` (which filters `WHERE doc_type IN ('contract', 'agreement')`) returns null, making contracts invisible.
- Both `category` and `doc_type` columns already exist on the `documents` table — no migration needed.

- [ ] **Step 1: Replace `insertObligation` at line 986**

Find this exact block (lines 986–994):
```js
export function insertObligation({ documentId, obligationType, title, description, clauseReference, dueDate, recurrence, noticePeriodDays, owner, escalationTo, proofDescription, evidenceJson, category, activation, summary, detailsJson, penalties, stage }) {
  const statusValue = activation || "active";
  const result = run(
    `INSERT INTO contract_obligations (document_id, obligation_type, title, description, clause_reference, due_date, recurrence, notice_period_days, owner, escalation_to, proof_description, evidence_json, category, activation, status, summary, details_json, penalties, stage)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [documentId, obligationType, title, description || null, clauseReference || null, dueDate || null, recurrence || null, noticePeriodDays || null, owner || null, escalationTo || null, proofDescription || null, evidenceJson || "[]", category || null, statusValue, statusValue, summary || null, detailsJson || "{}", penalties || null, stage || "active"]
  );
  return result.lastInsertRowId;
}
```

Replace it with:
```js
export function insertObligation({ documentId, obligationType, title, description, clauseReference, dueDate, recurrence, noticePeriodDays, owner, escalationTo, proofDescription, evidenceJson, category, department, activation, summary, detailsJson, penalties, stage }) {
  const statusValue = activation || "active";
  const result = run(
    `INSERT INTO contract_obligations (document_id, obligation_type, title, description, clause_reference, due_date, recurrence, notice_period_days, owner, escalation_to, proof_description, evidence_json, category, department, activation, status, summary, details_json, penalties, stage)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [documentId, obligationType, title, description || null, clauseReference || null, dueDate || null, recurrence || null, noticePeriodDays || null, owner || null, escalationTo || null, proofDescription || null, evidenceJson || "[]", category || null, department || null, statusValue, statusValue, summary || null, detailsJson || "{}", penalties || null, stage || "active"]
  );
  return result.lastInsertRowId;
}
```

Key change: `department` added to function signature and as column 14 / value 14 in the INSERT (after `category`, before `activation`). Column count goes from 19 to 20, placeholder count goes from 19 `?` to 20 `?`.

- [ ] **Step 2: Extend `allowedFields` in `updateContractMetadata` at line ~1252**

Find this exact block:
```js
  const allowedFields = [
    "contracting_company",
    "contracting_vendor",
    "signature_date",
    "commencement_date",
    "expiry_date",
  ];
```

Replace it with:
```js
  const allowedFields = [
    "contracting_company",
    "contracting_vendor",
    "signature_date",
    "commencement_date",
    "expiry_date",
    "name",
    "status",
    "category",
    "doc_type",
  ];
```

- [ ] **Step 3: Verify compilation**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add lib/db.js
git commit -m "feat: extend insertObligation with department, updateContractMetadata with name/status/category/doc_type"
```

---

### Task 2: Update `src/app/api/contracts/[id]/route.ts`

**Files:**
- Modify: `src/app/api/contracts/[id]/route.ts`

**What to know before starting:**
- This file currently has no `export const runtime = "nodejs"` and no `ensureDb()`. Without `runtime = "nodejs"`, the route may run in the Edge runtime on cold start, which cannot use the SQLite-backed `lib/db.js`.
- Both the GET handler and PATCH handler need `await ensureDb()` as their first call.
- The PATCH handler destructures only 5 fields; extend to destructure `name`, `status`, `category`, `doc_type`.
- After `updateContractMetadata`, the PATCH handler calls `getContractById(id)` and returns the result. Add a null check: if the result is null, return a 500 (meaning `doc_type` was not written correctly).

- [ ] **Step 1: Replace the entire file content**

Replace `src/app/api/contracts/[id]/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import {
  getContractById,
  updateContractMetadata,
  getObligationsByDocumentId,
} from "@/lib/db-imports";

export const runtime = "nodejs";

/**
 * GET /api/contracts/[id]
 * Get contract with full details and obligations
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDb();
    const params = await props.params;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const contract = await getContractById(id);
    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    const obligations = await getObligationsByDocumentId(id);

    return NextResponse.json({
      contract: {
        ...contract,
        obligations,
      },
    });
  } catch (error) {
    console.error("Error fetching contract:", error);
    return NextResponse.json(
      { error: "Failed to fetch contract" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/contracts/[id]
 * Update contract metadata
 */
export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDb();
    const params = await props.params;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json();
    const {
      contracting_company,
      contracting_vendor,
      signature_date,
      commencement_date,
      expiry_date,
      name,
      status,
      category,
      doc_type,
    } = body;

    const metadata: Record<string, any> = {};
    if (contracting_company !== undefined) metadata.contracting_company = contracting_company;
    if (contracting_vendor !== undefined) metadata.contracting_vendor = contracting_vendor;
    if (signature_date !== undefined) metadata.signature_date = signature_date;
    if (commencement_date !== undefined) metadata.commencement_date = commencement_date;
    if (expiry_date !== undefined) metadata.expiry_date = expiry_date;
    if (name !== undefined) metadata.name = name;
    if (status !== undefined) metadata.status = status;
    if (category !== undefined) metadata.category = category;
    if (doc_type !== undefined) metadata.doc_type = doc_type;

    await updateContractMetadata(id, metadata);

    const updatedContract = await getContractById(id);
    if (!updatedContract) {
      return NextResponse.json(
        { error: "Contract not found after update — doc_type may not have been set" },
        { status: 500 }
      );
    }
    return NextResponse.json({ contract: updatedContract });
  } catch (error) {
    console.error("Error updating contract:", error);
    return NextResponse.json(
      { error: "Failed to update contract" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add src/app/api/contracts/\[id\]/route.ts
git commit -m "feat: add runtime/ensureDb to contracts route, extend PATCH to accept name/status/category/doc_type"
```

---

### Task 3: Add GET to `src/app/api/documents/[id]/route.ts`

**Files:**
- Modify: `src/app/api/documents/[id]/route.ts`

**What to know before starting:**
- This file currently exports only `DELETE`. It already has `export const runtime = "nodejs"`, `import { ensureDb }`, and `import { getDocumentById }` at the top.
- The new GET handler must follow the same `props` wrapper pattern as the DELETE handler. Use a try/catch.
- `getDocumentById` is synchronous — do NOT use `await` on it.

- [ ] **Step 1: Add the GET handler before the DELETE handler**

Open `src/app/api/documents/[id]/route.ts`. After the imports and the `export const runtime = "nodejs"` line, add the following GET handler **before** the existing DELETE handler:

```ts
export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDb();
    const params = await props.params;
    const docId = parseInt(params.id, 10);
    if (isNaN(docId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    const doc = getDocumentById(docId);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ document: doc });
  } catch (error) {
    console.error("Error fetching document:", error);
    return NextResponse.json({ error: "Failed to fetch document" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add src/app/api/documents/\[id\]/route.ts
git commit -m "feat: add GET /api/documents/[id] endpoint"
```

---

### Task 4: Add POST to `src/app/api/documents/[id]/obligations/route.ts`

**Files:**
- Modify: `src/app/api/documents/[id]/obligations/route.ts`

**What to know before starting:**
- This file already has `export const runtime = "nodejs"`, `import { ensureDb }`, and `import { getDocumentById }` at the top.
- `insertObligation` must be added to the import from `@/lib/db-imports`.
- `obligationType` must default to `"general"` if empty/missing — `obligation_type` is NOT NULL in the schema.
- `noticePeriodDays` must be parsed with `parseInt` and guarded with `isNaN` — **do NOT use `|| null`** because `0` is a valid value that `|| null` would incorrectly coerce to `null`.
- The `key` field is never sent from the client, so no stripping needed server-side.
- `stage: "active"` is the correct default (matches AI processing path).

- [ ] **Step 1: Add `insertObligation` to the imports**

Find the existing import line:
```ts
import { getDocumentById, getObligationsByDocumentId } from "@/lib/db-imports";
```

Replace it with:
```ts
import { getDocumentById, getObligationsByDocumentId, insertObligation } from "@/lib/db-imports";
```

- [ ] **Step 2: Add the POST handler after the GET handler**

Append the following to the end of `src/app/api/documents/[id]/obligations/route.ts`:

```ts
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const docId = parseInt(id, 10);

  try {
    if (isNaN(docId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const doc = getDocumentById(docId);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const body = await request.json();

    const noticePeriodDaysParsed = parseInt(body.noticePeriodDays, 10);
    const noticePeriodDays = isNaN(noticePeriodDaysParsed) ? null : noticePeriodDaysParsed;

    const newId = insertObligation({
      documentId: docId,
      obligationType: body.obligationType || "general",
      title: body.title,
      description: body.description,
      clauseReference: body.clauseReference,
      dueDate: body.dueDate,
      recurrence: body.recurrence,
      noticePeriodDays,
      owner: body.owner,
      escalationTo: body.escalationTo,
      proofDescription: body.proofDescription,
      evidenceJson: "[]",
      category: body.category,
      department: body.department,
      activation: body.activation,
      summary: body.summary,
      detailsJson: "{}",
      penalties: body.penalties,
      stage: "active",
    });

    return NextResponse.json({ id: newId }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add src/app/api/documents/\[id\]/obligations/route.ts
git commit -m "feat: add POST /api/documents/[id]/obligations endpoint"
```

---

## Chunk 2: Dialog and new page

### Task 5: Update `src/components/contracts/add-contract-dialog.tsx`

**Files:**
- Modify: `src/components/contracts/add-contract-dialog.tsx`

**What to know before starting:**
- The current dialog has one upload button ("Upload & Process") that uploads then AI-processes. Replace it with two buttons: "Add with AI" (existing behavior) and "Add manually" (upload only, then navigate).
- The `Step` type currently has 5 variants. Add `"uploading-manual"`.
- The `handleClose` guard at line 45 currently only blocks `"processing"`. Extend it to also block `"uploading-manual"`. The X button visibility check at line 109 uses the same condition — update both.
- The `handleUpload` function drives the AI path. The new `handleUploadManual` function is a parallel path that stops after upload (no `handleProcess` call) and navigates instead.
- Import `useRouter` from `next/navigation`. The component is already `"use client"`.
- `reset()` must be called **before** `router.push()` — the dialog renders `null` when `!open` (line 101), so calling `reset()` first is safe and ensures `isSubmitting` is cleared if the component is ever remounted.

- [ ] **Step 1: Add `useRouter` import**

Find:
```ts
import { useState, useRef, useEffect } from "react";
```

Replace with:
```ts
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
```

- [ ] **Step 2: Extend the `Step` type**

Find:
```ts
type Step = "upload" | "processing" | "done" | "error-upload" | "error-process";
```

Replace with:
```ts
type Step = "upload" | "uploading-manual" | "processing" | "done" | "error-upload" | "error-process";
```

- [ ] **Step 3: Add `router` inside the component**

Find the line:
```ts
export function AddContractDialog({ open, onOpenChange, onSuccess }: AddContractDialogProps) {
```

After the existing state declarations (after `const [isSubmitting, setIsSubmitting] = useState(false);`), add:
```ts
  const router = useRouter();
```

- [ ] **Step 4: Update `handleClose` to block `"uploading-manual"`**

Find:
```ts
  const handleClose = () => {
    if (step === "processing") return; // cannot dismiss during processing
    reset();
    onOpenChange(false);
  };
```

Replace with:
```ts
  const handleClose = () => {
    if (step === "processing" || step === "uploading-manual") return;
    reset();
    onOpenChange(false);
  };
```

- [ ] **Step 5: Add `handleUploadManual` function after `handleUpload`**

After the closing `};` of `handleUpload` (around line 92), add:

```ts
  const handleUploadManual = async () => {
    if (!file) return;
    setIsSubmitting(true);
    setError("");
    setStep("uploading-manual");

    const formData = new FormData();
    formData.append("file", file);
    if (category) formData.append("category", category);

    try {
      const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      const docId: number = data.document.id;
      reset();
      onOpenChange(false);
      router.push(`/contracts/new?id=${docId}`);
    } catch (err) {
      setIsSubmitting(false);
      setError(err instanceof Error ? err.message : "Upload failed");
      setStep("error-upload");
    }
  };
```

- [ ] **Step 6: Update the X button visibility and the upload step buttons**

Find the X button visibility check:
```tsx
          {step !== "processing" && (
```

Replace with:
```tsx
          {step !== "processing" && step !== "uploading-manual" && (
```

Find the existing single button block at the bottom of the upload step:
```tsx
              <button
                onClick={handleUpload}
                disabled={!file || isSubmitting}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Upload &amp; Process
              </button>
```

Replace with two buttons:
```tsx
              <button
                onClick={handleUploadManual}
                disabled={!file || isSubmitting}
                className="px-3 py-1.5 text-sm border rounded hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add manually
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || isSubmitting}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add with AI
              </button>
```

- [ ] **Step 7: Add the `"uploading-manual"` step UI**

After the closing `)}` of the `{/* Step 2: Processing */}` block (around line 180), add:

```tsx
        {/* Step: Uploading (manual path) */}
        {step === "uploading-manual" && (
          <div className="py-10 text-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Uploading contract…</p>
            <p className="text-xs text-muted-foreground mt-1">This may take a moment.</p>
          </div>
        )}
```

- [ ] **Step 8: Verify compilation**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add src/components/contracts/add-contract-dialog.tsx
git commit -m "feat: add 'Add manually' button and uploading-manual step to add-contract-dialog"
```

---

### Task 6: Create the `/contracts/new` page (two files)

**Files:**
- Create: `src/app/(app)/contracts/new/page.tsx` — Server Component shell, no `"use client"`
- Create: `src/app/(app)/contracts/new/ContractsNewForm.tsx` — `"use client"` Client Component with all hooks and state

**What to know before starting:**
- `useSearchParams()` in Next.js App Router requires a `<Suspense>` boundary owned by a Server Component. `page.tsx` must NOT have `"use client"` — it is a Server Component that wraps `<ContractsNewForm>` in `<Suspense>`. `ContractsNewForm` lives in its own `"use client"` file.
- `ContractsNewForm` fetches `GET /api/documents/{id}` on mount to pre-fill the contract name.
- Status field: always initialise to `"unsigned"` from form state — do NOT use the fetched `document.status` (which is `"draft"` and not a valid key in `CONTRACT_STATUS_DISPLAY`).
- `noticePeriodDays` is a string in form state (all fields are `""` initially). Strip `key` and parse `noticePeriodDays` before POSTing obligations.
- `DEPARTMENTS` and `OBLIGATION_CATEGORIES` are `readonly string[]` — use `.map()`, not `Object.entries()`.
- `CONTRACT_STATUS_DISPLAY` is `Record<string, string>` — use `Object.entries()`.
- Card components are from `@/components/ui/card`.
- `setSaving(false)` must be called on the **success path** before `router.push("/contracts")` — otherwise the button stays disabled if the component doesn't unmount immediately.

- [ ] **Step 1a: Create the Server Component shell `page.tsx`**

Create `src/app/(app)/contracts/new/page.tsx` (no `"use client"` directive):

```tsx
import { Suspense } from "react";
import { ContractsNewForm } from "./ContractsNewForm";

export default function ContractsNewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <ContractsNewForm />
    </Suspense>
  );
}
```

- [ ] **Step 1b: Create the Client Component `ContractsNewForm.tsx`**

Create `src/app/(app)/contracts/new/ContractsNewForm.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEPARTMENTS,
  OBLIGATION_CATEGORIES,
  CONTRACT_STATUS_DISPLAY,
} from "@/lib/constants";

/* ── Types ── */

interface ObligationDraft {
  key: string;
  title: string;
  obligationType: string;
  description: string;
  clauseReference: string;
  dueDate: string;
  recurrence: string;
  noticePeriodDays: string;
  owner: string;
  escalationTo: string;
  category: string;
  department: string;
  summary: string;
  activation: string;
  penalties: string;
  proofDescription: string;
}

function makeObligation(): ObligationDraft {
  return {
    key: crypto.randomUUID(),
    title: "",
    obligationType: "",
    description: "",
    clauseReference: "",
    dueDate: "",
    recurrence: "",
    noticePeriodDays: "",
    owner: "",
    escalationTo: "",
    category: "",
    department: "",
    summary: "",
    activation: "",
    penalties: "",
    proofDescription: "",
  };
}

/* ── ObligationFormCard ── */

interface ObligationFormCardProps {
  obligation: ObligationDraft;
  onChange: (key: string, field: string, value: string) => void;
  onRemove: (key: string) => void;
}

function ObligationFormCard({ obligation, onChange, onRemove }: ObligationFormCardProps) {
  const field = (name: string, label: string, type: "text" | "textarea" | "date" | "number" = "text", placeholder = "") => (
    <div className={type === "textarea" ? "col-span-2" : ""}>
      <label className="text-sm font-medium mb-1 block">{label}</label>
      {type === "textarea" ? (
        <textarea
          value={(obligation as unknown as Record<string, string>)[name]}
          onChange={(e) => onChange(obligation.key, name, e.target.value)}
          rows={2}
          className="w-full px-2 py-1.5 border rounded text-sm bg-background resize-none"
          placeholder={placeholder}
        />
      ) : (
        <input
          type={type}
          value={(obligation as unknown as Record<string, string>)[name]}
          onChange={(e) => onChange(obligation.key, name, e.target.value)}
          className="w-full px-2 py-1.5 border rounded text-sm bg-background"
          placeholder={placeholder}
        />
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Obligation</CardTitle>
          <button
            type="button"
            onClick={() => onRemove(obligation.key)}
            className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
            aria-label="Remove obligation"
          >
            ✕
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* Title (required) */}
          <div className="col-span-2">
            <label className="text-sm font-medium mb-1 block">
              Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={obligation.title}
              onChange={(e) => onChange(obligation.key, "title", e.target.value)}
              className="w-full px-2 py-1.5 border rounded text-sm bg-background"
            />
          </div>
          {field("obligationType", "Type", "text", "e.g. Payment, Reporting")}
          {field("clauseReference", "Clause reference")}
          {field("dueDate", "Due date", "date")}
          {field("recurrence", "Recurrence", "text", "e.g. monthly, annually")}
          {field("noticePeriodDays", "Notice period (days)", "number")}
          {field("owner", "Owner")}
          {field("escalationTo", "Escalation to")}
          {field("activation", "Activation")}
          {/* Category select */}
          <div>
            <label className="text-sm font-medium mb-1 block">Category</label>
            <select
              value={obligation.category}
              onChange={(e) => onChange(obligation.key, "category", e.target.value)}
              className="w-full px-2 py-1.5 border rounded text-sm bg-background"
            >
              <option value="">Select…</option>
              {OBLIGATION_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          {/* Department select */}
          <div>
            <label className="text-sm font-medium mb-1 block">Department</label>
            <select
              value={obligation.department}
              onChange={(e) => onChange(obligation.key, "department", e.target.value)}
              className="w-full px-2 py-1.5 border rounded text-sm bg-background"
            >
              <option value="">Select…</option>
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
          {field("description", "Description", "textarea")}
          {field("summary", "Summary", "textarea")}
          {field("penalties", "Penalties", "textarea")}
          {field("proofDescription", "Proof description", "textarea")}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── ContractsNewForm (client component) ── */

export function ContractsNewForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");

  // Contract Details state
  const [contractName, setContractName] = useState("");
  const [contractingCompany, setContractingCompany] = useState("");
  const [contractingVendor, setContractingVendor] = useState("");
  const [signatureDate, setSignatureDate] = useState("");
  const [commencementDate, setCommencementDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [contractCategory, setContractCategory] = useState("");
  const [status, setStatus] = useState("unsigned"); // always "unsigned" by default, not from document.status

  // Obligations state
  const [obligations, setObligations] = useState<ObligationDraft[]>([]);

  // Load / save state
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  // Fetch document on mount to pre-fill name
  useEffect(() => {
    if (!id) {
      setLoadError("No document ID provided.");
      return;
    }
    fetch(`/api/documents/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Document not found");
        return res.json();
      })
      .then((data) => {
        setContractName(data.document?.name ?? "");
      })
      .catch(() => {
        setLoadError("Failed to load document. It may have been deleted.");
      });
  }, [id]);

  const addObligation = () => {
    setObligations((prev) => [...prev, makeObligation()]);
  };

  const handleObligationChange = (key: string, field: string, value: string) => {
    setObligations((prev) =>
      prev.map((ob) => (ob.key === key ? { ...ob, [field]: value } : ob))
    );
  };

  const handleObligationRemove = (key: string) => {
    setObligations((prev) => prev.filter((ob) => ob.key !== key));
  };

  const handleSave = async () => {
    if (!id) return;

    if (!contractName.trim()) {
      setSaveError("Contract name is required.");
      return;
    }

    setSaving(true);
    setSaveError("");

    // Step 1: PATCH contract metadata (also sets doc_type = "contract")
    try {
      const patchRes = await fetch(`/api/contracts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contractName.trim(),
          contracting_company: contractingCompany || null,
          contracting_vendor: contractingVendor || null,
          signature_date: signatureDate || null,
          commencement_date: commencementDate || null,
          expiry_date: expiryDate || null,
          category: contractCategory || null,
          status,
          doc_type: "contract",
        }),
      });
      const patchData = await patchRes.json();
      if (!patchRes.ok) throw new Error(patchData.error || "Failed to save contract");
      if (!patchData.contract) {
        throw new Error("Contract save failed — document type not set correctly. Please try again.");
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save contract");
      setSaving(false);
      return;
    }

    // Step 2: POST obligations sequentially
    for (let i = 0; i < obligations.length; i++) {
      const ob = obligations[i];
      // Exclude the UI-only `key` field; parse noticePeriodDays safely
      const { key: _key, noticePeriodDays: rawDays, ...rest } = ob;
      const noticePeriodDaysParsed = parseInt(rawDays, 10);
      const noticePeriodDays = isNaN(noticePeriodDaysParsed) ? null : noticePeriodDaysParsed;

      try {
        const obRes = await fetch(`/api/documents/${id}/obligations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...rest, noticePeriodDays }),
        });
        if (!obRes.ok) {
          const obData = await obRes.json();
          throw new Error(obData.error || `Obligation ${i + 1} failed`);
        }
      } catch (err) {
        setSaveError(
          `Contract metadata saved, but obligation ${i + 1} of ${obligations.length} failed: ${
            err instanceof Error ? err.message : "Unknown error"
          }. Remaining obligations were not saved.`
        );
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    router.push("/contracts");
  };

  // Error loading document
  if (loadError) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive mb-2">{loadError}</p>
        <a href="/contracts" className="text-sm text-primary underline">
          ← Back to Contracts
        </a>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Add Contract Manually</h2>

      {/* Contract Details card */}
      <Card>
        <CardHeader>
          <CardTitle>Contract Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {/* Contract name */}
            <div className="col-span-2">
              <label className="text-sm font-medium mb-1 block">
                Contract name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={contractName}
                onChange={(e) => setContractName(e.target.value)}
                className="w-full px-2 py-1.5 border rounded text-sm bg-background"
              />
            </div>

            {/* Contracting company */}
            <div>
              <label className="text-sm font-medium mb-1 block">Contracting company</label>
              <input
                type="text"
                value={contractingCompany}
                onChange={(e) => setContractingCompany(e.target.value)}
                className="w-full px-2 py-1.5 border rounded text-sm bg-background"
              />
            </div>

            {/* Contracting vendor */}
            <div>
              <label className="text-sm font-medium mb-1 block">Contracting vendor</label>
              <input
                type="text"
                value={contractingVendor}
                onChange={(e) => setContractingVendor(e.target.value)}
                className="w-full px-2 py-1.5 border rounded text-sm bg-background"
              />
            </div>

            {/* Signature date */}
            <div>
              <label className="text-sm font-medium mb-1 block">Signature date</label>
              <input
                type="date"
                value={signatureDate}
                onChange={(e) => setSignatureDate(e.target.value)}
                className="w-full px-2 py-1.5 border rounded text-sm bg-background"
              />
            </div>

            {/* Commencement date */}
            <div>
              <label className="text-sm font-medium mb-1 block">Commencement date</label>
              <input
                type="date"
                value={commencementDate}
                onChange={(e) => setCommencementDate(e.target.value)}
                className="w-full px-2 py-1.5 border rounded text-sm bg-background"
              />
            </div>

            {/* Expiry date */}
            <div>
              <label className="text-sm font-medium mb-1 block">Expiry date</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-2 py-1.5 border rounded text-sm bg-background"
              />
            </div>

            {/* Category (owning department) */}
            <div>
              <label className="text-sm font-medium mb-1 block">Category</label>
              <select
                value={contractCategory}
                onChange={(e) => setContractCategory(e.target.value)}
                className="w-full px-2 py-1.5 border rounded text-sm bg-background"
              >
                <option value="">Select department…</option>
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-2 py-1.5 border rounded text-sm bg-background"
              >
                {Object.entries(CONTRACT_STATUS_DISPLAY).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Obligations */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Obligations</h3>
        {obligations.map((ob) => (
          <ObligationFormCard
            key={ob.key}
            obligation={ob}
            onChange={handleObligationChange}
            onRemove={handleObligationRemove}
          />
        ))}
        <button
          type="button"
          onClick={addObligation}
          className="px-3 py-1.5 text-sm border rounded hover:bg-muted transition-colors"
        >
          + Add Obligation
        </button>
      </div>

      {/* Save error */}
      {saveError && (
        <p className="text-sm text-destructive">{saveError}</p>
      )}

      {/* Save button */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? "Saving…" : "Save Contract"}
      </button>
    </div>
  );
}

```

- [ ] **Step 2: Verify compilation**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add "src/app/(app)/contracts/new/page.tsx" "src/app/(app)/contracts/new/ContractsNewForm.tsx"
git commit -m "feat: add /contracts/new manual contract creation page"
```
