# Contract Manual Creation

**Date:** 2026-03-15

## Overview

Two changes:
1. The "Add New Contract" dialog gains a choice between AI-assisted and manual contract creation after file upload.
2. A new full-page manual entry flow (`/contracts/new`) lets users fill in all contract metadata and add obligations one by one.

Four supporting changes to make it all work:
- Add `GET /api/documents/[id]` endpoint to retrieve a raw document row.
- Extend `updateContractMetadata` (and the PATCH route) to accept `name`, `status`, `category`, and `doc_type`.
- Extend `insertObligation` to accept and persist the `department` field.
- Add `POST /api/documents/[id]/obligations` endpoint.

---

## Section 1 — Dialog changes (`add-contract-dialog.tsx`)

### New Step type

Add `"uploading-manual"` to the `Step` union:
```ts
type Step = "upload" | "uploading-manual" | "processing" | "done" | "error-upload" | "error-process";
```

### Upload step — button changes

The existing "Upload & Process" button is replaced by two buttons:

- **"Add with AI"** — uploads the file then calls the AI processing endpoint (existing behavior). Enabled only when a file is selected and `isSubmitting` is false.
- **"Add manually"** — uploads the file only (no AI processing), then navigates to `/contracts/new?id={docId}`. Enabled only when a file is selected and `isSubmitting` is false.

"Cancel" remains unchanged.

### "Add manually" flow

1. User clicks "Add manually" with a file selected.
2. `isSubmitting` set to `true`, step transitions to `"uploading-manual"`.
3. File POSTed to `/api/documents/upload` (identical form data to the AI path).
4. On success: call `reset()` (to clear state and reset `isSubmitting`), then `onOpenChange(false)` to close the dialog, then `router.push(`/contracts/new?id=${docId}`)`.
5. On failure: `setIsSubmitting(false)`, set error, transition to `"error-upload"`.

**Important:** `reset()` must be called before navigation to ensure `isSubmitting` is cleared. If the dialog is remounted before React GCs it, buttons must not appear permanently disabled.

### Close button and `handleClose` guard

Both `step === "processing"` and `step === "uploading-manual"` block dismissal. Update every guard:
```ts
if (step === "processing" || step === "uploading-manual") return;
```
The close button (X) visibility check uses the same condition.

### "uploading-manual" step UI

Same spinner layout as `"processing"` (copy the spinner JSX block), but with different text:
```
[spinner]
Uploading contract…
This may take a moment.
```

### Navigation

`useRouter` from `next/navigation` imported and used for the push. The component is already `"use client"`.

---

## Section 2 — New page `/contracts/new`

**File:** `src/app/(app)/contracts/new/page.tsx`

### Suspense wrapper

`useSearchParams()` in Next.js App Router requires a `<Suspense>` boundary. Structure the file as:

```tsx
// page.tsx — Server Component shell
export default function ContractsNewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <ContractsNewForm />
    </Suspense>
  );
}
```

`ContractsNewForm` is a `"use client"` component in the same file that calls `useSearchParams()`.

### Data fetching on mount

`ContractsNewForm` reads `id` from `useSearchParams()`. On mount, fetches `GET /api/documents/{id}` (new endpoint — see Section 3) to retrieve the document and pre-fill the contract name field.

If `id` param is missing or the fetch fails, display an error message with a link back to `/contracts`.

### Contract Details card

Displayed as a `Card` at the top. Fields:

| Field | Input type | Notes |
|-------|-----------|-------|
| Contract name | text | Pre-filled from `document.name` |
| Contracting company | text | |
| Contracting vendor | text | |
| Signature date | date | |
| Commencement date | date | |
| Expiry date | date | |
| Category | select | Options from `DEPARTMENTS` constant (`@/lib/constants`). This is the owning department for the contract (e.g. Finance, HR) — intentionally uses `DEPARTMENTS`, not `OBLIGATION_CATEGORIES`. `DEPARTMENTS` is a `readonly string[]` array — iterate with `.map()`, use the string as both `value` and label. |
| Status | select | Keys/labels from `CONTRACT_STATUS_DISPLAY`. Always initialise this field to `"unsigned"` in form state regardless of `document.status` — a newly uploaded document has `status = 'draft'` (db default) which is not a valid key in `CONTRACT_STATUS_DISPLAY` and would render as a blank selection. Overwriting the DB's `draft` value with `"unsigned"` on every save is correct and intentional. `CONTRACT_STATUS_DISPLAY` is a `Record<string, string>` — iterate with `Object.entries()`. |

### Obligations section

Below the Contract Details card. Starts empty.

**"Add Obligation" button** appends a new blank obligation form card. Each card has all user-facing obligation fields:

| Field | Input type | Notes |
|-------|-----------|-------|
| Title | text | Required |
| Type | text | e.g. "Payment", "Reporting" |
| Description | textarea | |
| Clause reference | text | |
| Due date | date | |
| Recurrence | text | e.g. "monthly", "annually" |
| Notice period (days) | number | |
| Owner | text | |
| Escalation to | text | |
| Category | select | Options from `OBLIGATION_CATEGORIES` (`@/lib/constants`): `"payments"`, `"termination"`, `"legal"`, `"others"`. This is a `readonly string[]` array — iterate with `.map()`, use the string as both `value` and label. |
| Department | select | Options from `DEPARTMENTS` (`@/lib/constants`). Also a `readonly string[]` array — iterate with `.map()`. |
| Summary | textarea | |
| Activation | text | |
| Penalties | textarea | |
| Proof description | textarea | |

Each obligation card has an **✕ (remove) button** in its header.

State: `obligations` is an array of objects, each with a unique `key` (e.g. `crypto.randomUUID()` or `Date.now().toString()`) for React reconciliation and all fields above initialised to `""`.

### `ObligationFormCard` component

Defined as a local component within the same file. Props:
```ts
interface ObligationFormCardProps {
  obligation: ObligationDraft;
  onChange: (key: string, field: string, value: string) => void;
  onRemove: (key: string) => void;
}
```

### Save flow

Single **"Save Contract"** button at the bottom.

Both `{id}` values below are the **document ID** returned by the upload endpoint (the same integer used in both `/api/contracts/{id}` and `/api/documents/{id}/obligations` — contracts are stored as documents rows).

On click:
1. PATCH `/api/contracts/{id}` with snake_case keys: `name`, `contracting_company`, `contracting_vendor`, `signature_date`, `commencement_date`, `expiry_date`, `category`, `status`, `doc_type: "contract"`. Including `doc_type: "contract"` in every PATCH ensures that the newly uploaded document (which has `doc_type = NULL` after upload) is tagged as a contract row so that `getContractById` can find it. (The PATCH route and `updateContractMetadata` are extended to accept `name`, `status`, `category`, and `doc_type` — see Section 3b.) **Validation:** if `name` is empty, show an inline error and do not submit. After the PATCH, check that the response body does not have `contract: null` — a null response means `getContractById` failed to find the row (doc_type was not written), and should be treated as an error.
2. For each obligation: POST `/api/documents/{id}/obligations` with all obligation fields. **Exclude the `key` property** — it is a UI-only reconciliation key and must not be sent to the server. These are sent sequentially.
3. On complete success: `router.push("/contracts")`.
4. On any failure: display inline error above the Save button; do not navigate.

**Partial save acknowledgement:** If the PATCH succeeds but one or more obligation POSTs fail, the contract metadata is saved but some obligations are not. This is accepted behaviour for this iteration — no rollback is attempted. The error message should indicate which step failed.

Loading state: button shows "Saving…" and is disabled during save.

### Page layout

```
/contracts/new
  <h2>Add Contract Manually</h2>
  <Card>
    <CardHeader>Contract Details</CardHeader>
    <CardContent>[fields grid]</CardContent>
  </Card>
  <div>
    <h3>Obligations</h3>
    {obligations.map(ob => <ObligationFormCard key={ob.key} ... />)}
    <button>+ Add Obligation</button>
  </div>
  [error message if any]
  <button disabled={saving}>Save Contract</button>
```

---

## Section 3 — Supporting backend changes

### 3a. New `GET /api/documents/[id]`

Add a GET handler to the existing **`src/app/api/documents/[id]/route.ts`** file (currently only has DELETE).

Use the same `props` wrapper pattern as the existing DELETE handler in this file:

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

`getDocumentById` is already exported from `@/lib/db-imports`.

### 3b. Extend `updateContractMetadata` and PATCH route to accept `name`, `status`, `category`, and `doc_type`

**`lib/db.js`** — add `"name"`, `"status"`, `"category"`, and `"doc_type"` to the `allowedFields` array inside `updateContractMetadata`. **Important:** `updateContractMetadata` silently returns early at line 1270 (`if (fields.length === 0) return`) if none of the passed keys match `allowedFields`. Verify that all four new keys are correctly added — a missed entry causes a silent no-op with no error, making the contract invisible in the list (which also filters on `doc_type`).

**`src/app/api/contracts/[id]/route.ts`** — this file currently has no `export const runtime = "nodejs"` and no `ensureDb()` call. Add both:
- Add `export const runtime = "nodejs"` at the top of the file (file-level export).
- Add `import { ensureDb } from "@/lib/server-utils"` to the imports.
- Call `await ensureDb()` at the start of **both the GET handler and the PATCH handler** bodies (before reading params). The existing GET handler is also currently missing `ensureDb()` and would fail on cold start.

The PATCH handler currently destructures only `{ contracting_company, contracting_vendor, signature_date, commencement_date, expiry_date }`. Extend it to also destructure and forward `name`, `status`, `category`, and `doc_type` (using snake_case keys consistent with the existing field names).

### 3c. Extend `insertObligation` to accept `department`

**`lib/db.js`** — replace the `insertObligation` function with the updated version below. `department` is inserted after `category` in the column list, placeholder list, and values array (position 14 of 20). The positional order must match exactly to avoid silent column misassignment:

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

### 3d. New `POST /api/documents/[id]/obligations`

Add a POST handler to **`src/app/api/documents/[id]/obligations/route.ts`** (currently only has GET).

Request body fields: `title` (required), `obligationType`, `description`, `clauseReference`, `dueDate`, `recurrence`, `noticePeriodDays`, `owner`, `escalationTo`, `category`, `department`, `summary`, `activation`, `penalties`, `proofDescription`.

**`obligationType` handling:** The `obligation_type` column is NOT NULL in the schema. If the caller omits `obligationType` or sends an empty string, default it to `"general"` before calling `insertObligation`.

Implementation:
0. `await ensureDb()` — the file already has `export const runtime = "nodejs"` and imports `ensureDb`. Call it at the start of the POST handler body before any DB access, following the same pattern as the GET handler in this file.
1. Parse and validate `docId`.
2. `getDocumentById(docId)` — 404 if missing.
3. `insertObligation({ documentId: docId, ...body fields, obligationType: body.obligationType || "general", evidenceJson: "[]", detailsJson: "{}", stage: "active" })`. **`stage: "active"` is the correct default** — it matches the value the AI processing path uses for obligations it creates, making manual and AI obligations consistent. **`noticePeriodDays` empty-string handling:** the obligation form initialises all fields to `""`. The POST handler passes the raw value; `insertObligation` coerces it to `null` via `noticePeriodDays || null`, which is acceptable (consistent with all other optional numeric fields in the DB layer).
4. Return `{ id: newId }` with status 201.

`insertObligation` is already exported from `@/lib/db-imports`.

---

## Data flow summary

All `{id}` values are the **document ID** — the same integer throughout.

```
AddContractDialog
  "Add manually" click
    → POST /api/documents/upload → { document.id }   (doc_type = NULL at this point)
    → reset() + onOpenChange(false) + router.push(/contracts/new?id={docId})

/contracts/new
  mount → GET /api/documents/{id} → pre-fill name
  save →
    PATCH /api/contracts/{id}              (incl. doc_type:"contract" → tags row as contract)
    POST  /api/documents/{id}/obligations  ×N  (one per obligation)
    → router.push(/contracts)
```

---

## Out of scope

- No changes to the AI processing path.
- No bulk obligation creation endpoint.
- No obligation reordering.
- No draft/autosave.
- No rollback on partial save failures.
