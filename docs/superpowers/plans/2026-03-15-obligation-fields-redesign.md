# Obligation Fields Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove five obsolete fields from the obligation form, add Start date + Repeating controls, and auto-create obligation copies when a repeating obligation's due date passes.

**Architecture:** DB layer changes first (migration + `insertObligation` + `spawnDueObligations`), then type/export updates, then API route (GET triggers spawn, POST accepts new fields), then the manual creation form, then the obligation card display. Each task is independently committable.

**Tech Stack:** Next.js 14 App Router, TypeScript, SQLite via `lib/db.js` (synchronous), shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-15-obligation-fields-redesign.md`

---

## Chunk 1: DB layer + types + exports

### Task 1: Extend `lib/db.js` — migration, insertObligation, updateObligation, spawnDueObligations

**Files:**
- Modify: `lib/db.js`

**What to know before starting:**
- The migration block for `contract_obligations` is around line 312 — it uses the `obMigrationCols` array pattern with try/catch per column.
- `insertObligation` is around line 986. It currently has 20 columns and 20 `?` placeholders. After this task it will have 24.
- `updateObligation` is around line 1010. Its `allowedFields` array is the first thing in the function body.
- `getContractById` is already exported from this same file — it can be called directly inside `spawnDueObligations` without an import.
- `query` (used in `spawnDueObligations`) is the synchronous SELECT-many helper already used throughout the file.
- All `db.js` functions are synchronous — no async/await.

- [ ] **Step 1: Add 4 columns to the migration block**

Find the `obMigrationCols` array (around line 312). It ends with `{ name: "finalization_document_id", def: "INTEGER" }`. Add **only these four new entries** after the existing last entry — do NOT add a second `finalization_document_id`:

```js
    // existing last entry — keep it, then append below:
    // { name: "finalization_document_id", def: "INTEGER" },
    { name: "start_date", def: "TEXT" },
    { name: "is_repeating", def: "INTEGER DEFAULT 0" },
    { name: "recurrence_interval", def: "INTEGER" },
    { name: "parent_obligation_id", def: "INTEGER REFERENCES contract_obligations(id)" },
```

- [ ] **Step 2: Replace the `insertObligation` function**

Replace the entire `insertObligation` function with:

```js
export function insertObligation({ documentId, obligationType, title, description, clauseReference, dueDate, recurrence, noticePeriodDays, owner, escalationTo, proofDescription, evidenceJson, category, department, activation, summary, detailsJson, penalties, stage, startDate, isRepeating, recurrenceInterval, parentObligationId }) {
  const statusValue = activation || "active";
  const result = run(
    `INSERT INTO contract_obligations (document_id, obligation_type, title, description, clause_reference, due_date, recurrence, notice_period_days, owner, escalation_to, proof_description, evidence_json, category, department, activation, status, summary, details_json, penalties, stage, start_date, is_repeating, recurrence_interval, parent_obligation_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [documentId, obligationType, title, description || null, clauseReference || null, dueDate || null, recurrence || null, noticePeriodDays || null, owner || null, escalationTo || null, proofDescription || null, evidenceJson || "[]", category || null, department || null, statusValue, statusValue, summary || null, detailsJson || "{}", penalties || null, stage || "active", startDate || null, isRepeating ? 1 : 0, recurrenceInterval || null, parentObligationId || null]
  );
  return result.lastInsertRowId;
}
```

24 columns, 24 `?` placeholders, 24 values — verify the counts match before saving.

- [ ] **Step 3: Extend `updateObligation` allowedFields**

Find the `allowedFields` array inside `updateObligation` (around line 1011). Add the four new column names at the end:

```js
  const allowedFields = ["obligation_type", "title", "description", "clause_reference", "due_date", "recurrence", "notice_period_days", "owner", "escalation_to", "proof_description", "evidence_json", "status", "category", "activation", "summary", "details_json", "penalties", "stage", "department", "finalization_note", "finalization_document_id", "start_date", "is_repeating", "recurrence_interval", "parent_obligation_id"];
```

- [ ] **Step 4: Add `spawnDueObligations` function**

Add this function immediately after `insertObligation` (before `getObligationsByDocumentId`):

```js
export function spawnDueObligations(documentId) {
  const contract = getContractById(documentId);
  if (!contract || !["active", "signed"].includes(contract.status)) return;

  const today = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < 100; i++) {
    const qualifying = query(
      `SELECT * FROM contract_obligations
       WHERE document_id = ?
         AND is_repeating = 1
         AND recurrence_interval IS NOT NULL
         AND due_date IS NOT NULL
         AND due_date < ?
         AND NOT EXISTS (
           SELECT 1 FROM contract_obligations c2
           WHERE c2.parent_obligation_id = contract_obligations.id
         )`,
      [documentId, today]
    );

    if (qualifying.length === 0) break;

    for (const ob of qualifying) {
      const d = new Date(ob.due_date + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + ob.recurrence_interval);
      const nextDue = d.toISOString().slice(0, 10);

      insertObligation({
        documentId: ob.document_id,
        obligationType: ob.obligation_type,
        title: ob.title,
        description: ob.description,
        clauseReference: ob.clause_reference,
        dueDate: nextDue,
        recurrence: ob.recurrence,
        noticePeriodDays: ob.notice_period_days,
        owner: ob.owner,
        escalationTo: ob.escalation_to,
        proofDescription: ob.proof_description,
        evidenceJson: "[]",
        category: ob.category,
        department: ob.department,
        activation: null,
        summary: ob.summary,
        detailsJson: "{}",
        penalties: ob.penalties,
        stage: "active",
        startDate: ob.start_date,
        isRepeating: ob.is_repeating,
        recurrenceInterval: ob.recurrence_interval,
        parentObligationId: ob.id,
      });
    }
  }
}
```

**Note:** `activation: null` forces `statusValue = "active"` in `insertObligation` for spawned children. `is_repeating` and `recurrence_interval` are copied from the parent so the child will also spawn its own next copy when its due date passes.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (TypeScript doesn't type-check `.js` files, but it validates project-wide imports).

- [ ] **Step 6: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add lib/db.js
git commit -m "feat: add repeating obligation columns, extend insertObligation, add spawnDueObligations"
```

---

### Task 2: Update `src/lib/db-imports.ts` and `src/lib/types.ts`

**Files:**
- Modify: `src/lib/db-imports.ts`
- Modify: `src/lib/types.ts`

**What to know before starting:**
- `src/lib/db-imports.ts` is a re-export barrel for `lib/db.js`. It currently exports `insertObligation`, `getObligationsByDocumentId`, `updateObligation`, etc. — but not `spawnDueObligations` (added in Task 1). Add it between `deleteObligation` and `getUpcomingObligations`.
- The `Obligation` interface in `src/lib/types.ts` is around line 42. It currently ends with `finalization_document_id: number | null`. Add four new fields directly after it.

- [ ] **Step 1: Add `spawnDueObligations` to the db-imports barrel**

In `src/lib/db-imports.ts`, find this block:

```ts
  insertObligation,
  getObligationsByDocumentId,
  getObligationById,
  updateObligation,
  deleteObligation,
  getUpcomingObligations,
```

Replace with:

```ts
  insertObligation,
  getObligationsByDocumentId,
  getObligationById,
  updateObligation,
  deleteObligation,
  spawnDueObligations,
  getUpcomingObligations,
```

- [ ] **Step 2: Add 4 fields to the `Obligation` interface**

In `src/lib/types.ts`, find:

```ts
  finalization_document_id: number | null;
```

Replace with:

```ts
  finalization_document_id: number | null;
  start_date: string | null;
  is_repeating: number;
  recurrence_interval: number | null;
  parent_obligation_id: number | null;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add src/lib/db-imports.ts src/lib/types.ts
git commit -m "feat: export spawnDueObligations, add new fields to Obligation type"
```

---

## Chunk 2: API route + manual creation form + obligation card display

### Task 3: Update `src/app/api/documents/[id]/obligations/route.ts`

**Files:**
- Modify: `src/app/api/documents/[id]/obligations/route.ts`

**What to know before starting:**
- The GET handler currently just calls `getObligationsByDocumentId`. It must call `spawnDueObligations(docId)` first.
- The POST handler currently passes `body.activation`, `body.recurrence`, `body.noticePeriodDays`, `body.penalties` to `insertObligation`. Extend it to also pass the four new fields.
- `spawnDueObligations` is synchronous — no `await`.
- Import `spawnDueObligations` from `@/lib/db-imports`.

- [ ] **Step 1: Add `spawnDueObligations` to the import**

Change:
```ts
import { getDocumentById, getObligationsByDocumentId, insertObligation } from "@/lib/db-imports";
```
to:
```ts
import { getDocumentById, getObligationsByDocumentId, insertObligation, spawnDueObligations } from "@/lib/db-imports";
```

- [ ] **Step 2: Call `spawnDueObligations` in the GET handler**

In the GET handler, add the spawn call before fetching obligations:

```ts
  try {
    const doc = getDocumentById(docId);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    spawnDueObligations(docId);

    const obligations = getObligationsByDocumentId(docId);
    return NextResponse.json({ obligations });
  }
```

- [ ] **Step 3: Extend the POST handler to accept new fields**

Replace the entire `insertObligation` call in the POST handler with:

```ts
    const recurrenceIntervalParsed = parseInt(body.recurrenceInterval, 10);
    const recurrenceInterval = isNaN(recurrenceIntervalParsed) ? null : recurrenceIntervalParsed;

    const newId = insertObligation({
      documentId: docId,
      obligationType: body.obligationType || "general",
      title: body.title,
      description: body.description,
      clauseReference: body.clauseReference,
      dueDate: body.dueDate,
      recurrence: body.recurrence,
      noticePeriodDays: body.noticePeriodDays ?? null,
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
      startDate: body.startDate,
      isRepeating: body.isRepeating ?? false,
      recurrenceInterval,
      parentObligationId: body.parentObligationId ?? null,
    });
```

Also remove the old `noticePeriodDays` parsing block (it was the `parseInt(body.noticePeriodDays, 10)` section above the original `insertObligation` call) since it's no longer needed as a separate variable — replace with `body.noticePeriodDays ?? null` inline as shown above.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add "src/app/api/documents/[id]/obligations/route.ts"
git commit -m "feat: call spawnDueObligations on GET, accept new fields in POST obligations route"
```

---

### Task 4: Update `src/app/(app)/contracts/new/ContractsNewForm.tsx`

**Files:**
- Modify: `src/app/(app)/contracts/new/ContractsNewForm.tsx`

**What to know before starting:**
- `ObligationDraft` interface (lines ~9-25) needs fields removed and added.
- `makeObligation()` factory (lines ~27-44) needs the same updates.
- `ObligationFormCardProps.onChange` type (line ~47) needs `string | boolean` for the value.
- `ObligationFormCard` renders fields using a `field()` helper for string inputs — the checkbox for `isRepeating` must be rendered manually outside this helper.
- `handleObligationChange` in the main `ContractsNewForm` function accepts `value: string` — change to `string | boolean`.
- `handleSave` needs validation for repeating obligations and must send the new fields.

- [ ] **Step 1: Update `ObligationDraft` interface**

Replace the current `ObligationDraft` interface with:

```ts
interface ObligationDraft {
  key: string;
  title: string;
  description: string;
  clauseReference: string;
  dueDate: string;
  startDate: string;
  isRepeating: boolean;
  recurrenceInterval: string;
  owner: string;
  escalationTo: string;
  category: string;
  department: string;
  summary: string;
  proofDescription: string;
}
```

Removed: `obligationType`, `noticePeriodDays`, `recurrence`, `activation`, `penalties`.
Added: `startDate`, `isRepeating`, `recurrenceInterval`.

- [ ] **Step 2: Update `makeObligation()` factory**

Replace with:

```ts
function makeObligation(): ObligationDraft {
  return {
    key: crypto.randomUUID(),
    title: "",
    description: "",
    clauseReference: "",
    dueDate: "",
    startDate: "",
    isRepeating: false,
    recurrenceInterval: "",
    owner: "",
    escalationTo: "",
    category: "",
    department: "",
    summary: "",
    proofDescription: "",
  };
}
```

- [ ] **Step 3: Update `ObligationFormCardProps` onChange type**

Change:
```ts
  onChange: (key: string, field: keyof ObligationDraft, value: string) => void;
```
to:
```ts
  onChange: (key: string, field: keyof ObligationDraft, value: string | boolean) => void;
```

- [ ] **Step 4: Replace `ObligationFormCard` render content**

The `field()` helper inside `ObligationFormCard` currently uses `value={obligation[name] as string}`. Keep the helper but update the fields block. Replace the entire `<CardContent ...>` block with:

```tsx
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {field("Title *", "title", "text")}
        {field("Clause reference", "clauseReference", "text")}
        {field("Due date", "dueDate", "date")}
        {field("Start date", "startDate", "date")}
        <div className="md:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={obligation.isRepeating}
              onChange={(e) => onChange(obligation.key, "isRepeating", e.target.checked)}
              className="rounded border-input"
            />
            Repeating?
          </label>
        </div>
        {obligation.isRepeating && (
          <div>
            <label className="block text-sm font-medium mb-1">Repeat every</label>
            <select
              className="w-full border border-input rounded px-3 py-2 text-sm bg-background"
              value={obligation.recurrenceInterval}
              onChange={(e) => onChange(obligation.key, "recurrenceInterval", e.target.value)}
            >
              <option value="">— select —</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">365 days</option>
            </select>
          </div>
        )}
        {field("Owner", "owner", "text")}
        {field("Escalation to", "escalationTo", "text")}
        {field("Category", "category", "select", OBLIGATION_CATEGORIES)}
        {field("Department", "department", "select", DEPARTMENTS)}
        {field("Description", "description", "textarea")}
        {field("Summary", "summary", "textarea")}
        {field("Proof description", "proofDescription", "textarea")}
      </CardContent>
```

Also update the `field()` helper's `value` reference to cast safely: change `value={obligation[name]}` to `value={obligation[name] as string}` (the field helper is only called for string fields now — boolean `isRepeating` is handled separately above).

- [ ] **Step 5: Update `handleObligationChange` in `ContractsNewForm`**

Change the function signature from `value: string` to `value: string | boolean`:

```ts
  const handleObligationChange = (key: string, field: string, value: string | boolean) => {
    setObligations((prev) =>
      prev.map((ob) => (ob.key === key ? { ...ob, [field]: value } : ob))
    );
  };
```

- [ ] **Step 6: Update `handleSave` — validation and POST body**

In `handleSave`, before `setSaving(true)`, add repeating validation:

```ts
    // Validate repeating obligations have an interval set
    for (const ob of obligations) {
      if (ob.isRepeating && !ob.recurrenceInterval) {
        setSaveError(`Obligation "${ob.title || "New Obligation"}": please select a repeat interval.`);
        return;
      }
    }
```

Then replace the obligation POST body construction. Find the `for (const ob of obligations)` loop and replace the body building with:

```ts
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { key: _key, isRepeating, recurrenceInterval, ...obData } = ob;
      const recurrenceIntervalParsed = parseInt(recurrenceInterval, 10);
      const finalRecurrenceInterval = !isRepeating ? null : (isNaN(recurrenceIntervalParsed) ? null : recurrenceIntervalParsed);

      const obRes = await fetch(`/api/documents/${id}/obligations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...obData,
          isRepeating,
          recurrenceInterval: finalRecurrenceInterval,
        }),
      });
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add "src/app/(app)/contracts/new/ContractsNewForm.tsx"
git commit -m "feat: update obligation form — remove type/notice/recurrence/activation/penalties, add start date and repeating controls"
```

---

### Task 5: Update `src/components/obligations/obligation-card.tsx`

**Files:**
- Modify: `src/components/obligations/obligation-card.tsx`

**What to know before starting:**
- The obligation card renders the expanded view of an obligation. It may display `penalties` and `activation` — these must be removed.
- Add display for `start_date` (if non-null) and a recurrence summary line (if `is_repeating = 1`).
- The `Obligation` type from `@/lib/types` now includes `start_date`, `is_repeating`, `recurrence_interval`, `parent_obligation_id` — these are available on the `ob` prop.
- Search for the string `penalties` in the file — remove any JSX block that renders it.
- Search for `activation` in the file — remove any JSX block that renders it as a display field (leave alone if it's used in logic unrelated to display).
- Add the two new display items in the metadata/details section of the expanded card.

- [ ] **Step 1: Read the full obligation-card.tsx**

Read `src/components/obligations/obligation-card.tsx` in full to find exactly where `penalties` and `activation` are rendered.

- [ ] **Step 2: Remove `penalties` display block**

Find and delete the JSX block that displays `ob.penalties`. It likely looks similar to:
```tsx
{ob.penalties && (
  <div ...>
    <span>Penalties</span>
    <span>{ob.penalties}</span>
  </div>
)}
```
Remove the entire block.

- [ ] **Step 3: Remove `activation` display block**

Find and delete any JSX block that renders `ob.activation` as a display field. If `activation` is used in conditional logic (e.g., `ob.activation === "active"` for status display), leave that logic untouched — only remove display-only rendering of the raw value.

- [ ] **Step 4: Add `start_date` display**

In the expanded content section — the `<div className="mt-4 pt-3 border-t space-y-4 ml-8">` container — add a `start_date` display immediately after the `{ob.summary && ...}` block:

```tsx
{ob.start_date && (
  <div className="text-sm">
    <span className="text-muted-foreground">Start date: </span>
    <span>{ob.start_date}</span>
  </div>
)}
```

- [ ] **Step 5: Add recurrence summary**

In the same metadata section, add a recurrence line — show only if `is_repeating` is truthy:

```tsx
{ob.is_repeating ? (
  <div className="text-sm">
    <span className="text-muted-foreground">Repeats every </span>
    <span>{ob.recurrence_interval} days</span>
  </div>
) : null}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add src/components/obligations/obligation-card.tsx
git commit -m "feat: remove penalties/activation display, add start_date and recurrence summary to obligation card"
```
