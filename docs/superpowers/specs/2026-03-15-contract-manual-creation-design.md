# Contract Manual Creation

**Date:** 2026-03-15

## Overview

Two changes:
1. The "Add New Contract" dialog gains a choice between AI-assisted and manual contract creation after file upload.
2. A new full-page manual entry flow (`/contracts/new`) lets users fill in all contract metadata and add obligations one by one.

A new `POST /api/documents/[id]/obligations` endpoint is added to support creating obligations manually.

---

## Section 1 — Dialog changes (`add-contract-dialog.tsx`)

### New Step type

Add `"uploading-manual"` to the `Step` union:
```ts
type Step = "upload" | "uploading-manual" | "processing" | "done" | "error-upload" | "error-process";
```

### Upload step — button changes

The existing "Upload & Process" button is replaced by two buttons:

- **"Add with AI"** — uploads the file then calls the AI processing endpoint (existing behavior). Enabled only when a file is selected.
- **"Add manually"** — uploads the file only (no AI processing), then navigates to `/contracts/new?id={docId}`. Enabled only when a file is selected.

"Cancel" remains unchanged.

### "Add manually" flow

1. User clicks "Add manually" with a file selected.
2. `isSubmitting` is set to `true`, step transitions to `"uploading-manual"`.
3. File is POSTed to `/api/documents/upload` (identical to the AI path).
4. On success, the dialog calls `router.push(`/contracts/new?id=${docId}`)` and `onOpenChange(false)` to close itself.
5. On upload failure, step transitions to `"error-upload"` (same error handling as today).

### "uploading-manual" step UI

Same spinner as `"processing"`:
```
[spinner]
Uploading contract…
This may take a moment.
```

### Navigation

`useRouter` from `next/navigation` is imported and used for the push. The `add-contract-dialog.tsx` component is already `"use client"`.

---

## Section 2 — New page `/contracts/new`

**File:** `src/app/(app)/contracts/new/page.tsx`

`"use client"` component. Reads `id` from `useSearchParams()`. On mount, fetches `GET /api/documents/{id}` to retrieve the document name (used to pre-fill the contract name field).

### Contract Details card

Displayed as a `Card` at the top of the page. Fields:

| Field | Input type | Notes |
|-------|-----------|-------|
| Contract name | text | Pre-filled from `document.name` |
| Contracting company | text | |
| Contracting vendor | text | |
| Signature date | date | |
| Commencement date | date | |
| Expiry date | date | |
| Category | select | Options from `DEPARTMENTS` constant |
| Status | select | Options: unsigned→"Inactive", signed→"To Sign", active→"Active", terminated→"Terminated". Default: `unsigned`. |

### Obligations section

Below the Contract Details card. Starts empty.

**"Add Obligation" button** appends a new blank obligation form card to the list. Each card renders all user-facing obligation fields:

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
| Category | select | Options from `DEPARTMENTS` |
| Department | select | Options from `DEPARTMENTS` |
| Summary | textarea | |
| Activation | text | |
| Penalties | textarea | |
| Proof description | textarea | |

Each obligation card has a **✕ (remove) button** in its header to delete it from the list.

State: `obligations` is an array of objects, each with a unique `key` (e.g. `Date.now()`) for React reconciliation and all the fields above initialised to `""`.

### Save flow

Single **"Save Contract"** button at the bottom of the page (below the obligations section).

On click:
1. PATCH `/api/contracts/{id}` with contract metadata fields.
2. For each obligation in the list: POST `/api/documents/{id}/obligations` with the obligation fields.
3. On complete success: `router.push("/contracts")`.
4. On any failure: display an inline error message; do not navigate.

Loading state: button shows "Saving…" and is disabled during the save.

### Error and loading states

- While fetching the document on mount: show a skeleton or "Loading…" placeholder.
- If `id` param is missing or document fetch fails: show an error message with a link back to `/contracts`.
- Save errors: displayed inline above the Save button.

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
  <button>Save Contract</button>
```

The obligation form cards are defined as a local component `ObligationFormCard` within the same file (they have no reuse outside this page).

---

## Section 3 — New API endpoint

**File:** `src/app/api/documents/[id]/obligations/route.ts`

Add a `POST` handler to the existing file (which currently only has `GET`).

**`POST /api/documents/[id]/obligations`**

Request body (all fields optional except `title` and `obligationType`):
```json
{
  "title": "string",
  "obligationType": "string",
  "description": "string | null",
  "clauseReference": "string | null",
  "dueDate": "string | null",
  "recurrence": "string | null",
  "noticePeriodDays": "number | null",
  "owner": "string | null",
  "escalationTo": "string | null",
  "category": "string | null",
  "department": "string | null",
  "summary": "string | null",
  "activation": "string | null",
  "penalties": "string | null",
  "proofDescription": "string | null"
}
```

Implementation:
1. Parse `id` from params, validate it is a number.
2. Call `getDocumentById(docId)` — return 404 if not found.
3. Call `insertObligation({ documentId: docId, ...fields, evidenceJson: "[]", detailsJson: "{}", stage: "active" })`.
4. Return `{ id: newId }` with status 201.

`insertObligation` is already exported from `@/lib/db-imports`.

---

## Data flow summary

```
AddContractDialog
  "Add manually" click
    → POST /api/documents/upload → { document.id }
    → router.push(/contracts/new?id={docId})

/contracts/new
  mount → GET /api/documents/{id} → pre-fill name
  save →
    PATCH /api/contracts/{id}   (metadata)
    POST  /api/documents/{id}/obligations  ×N  (one per obligation)
    → router.push(/contracts)
```

---

## Out of scope

- No changes to the AI processing path.
- No bulk obligation creation endpoint.
- No obligation reordering.
- No draft/autosave.
- The `department` field on `insertObligation` is set via the obligation form's Department select; `stage` defaults to `"active"`.
