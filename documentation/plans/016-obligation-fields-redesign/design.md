# Obligation Fields Redesign

**Date:** 2026-03-15

## Overview

Three targeted changes to the obligation data model and UI:

1. Remove five fields from the manual obligation form (`Type`, `Notice period`, `Recurrence`, `Activation`, `Penalties`) and replace two of them with cleaner alternatives (`Start date`, `Repeating?` + `Repeat every`).
2. Add four new database columns to support the new fields and obligation chaining.
3. Implement automatic obligation copy creation: when a repeating obligation's due date passes and the contract is still active, a new copy is created on the next page load with the due date advanced by the configured interval.

The AI extraction path (`lib/contracts.js`) is not changed. Old columns (`obligation_type`, `notice_period_days`, `recurrence`, `activation`, `penalties`) remain in the database for backward compatibility with AI-extracted obligations.

---

## Section 1 — Field changes

### Removed from the obligation form

| Field | Reason |
|-------|--------|
| Type (`obligation_type`) | Category already covers classification |
| Notice period (`notice_period_days`) | Redundant with due date |
| Recurrence (`recurrence`) | Replaced by structured repeating controls |
| Activation (`activation`) | Replaced by Start date |
| Penalties (`penalties`) | Removed |

These columns remain in the database. They are simply no longer rendered in the manual creation form or the obligation card display.

### Added to the obligation form

| Field | Input type | Notes |
|-------|-----------|-------|
| Start date | date | Stored in new `start_date` column |
| Repeating? | checkbox | Stored in new `is_repeating` column (0/1) |
| Repeat every | select | Only shown when Repeating is checked. Options: `7` (7 days), `30` (30 days), `90` (90 days), `365` (365 days). Stored in new `recurrence_interval` column. |

### Unchanged fields

Title (required), Clause reference, Due date, Owner, Escalation to, Category (select from `OBLIGATION_CATEGORIES`), Department (select from `DEPARTMENTS`), Description, Summary, Proof description.

---

## Section 2 — Database changes

### New columns (added via startup migration)

Four columns added to `contract_obligations` via the existing startup migration pattern in `lib/db.js`:

```sql
ALTER TABLE contract_obligations ADD COLUMN start_date TEXT;
ALTER TABLE contract_obligations ADD COLUMN is_repeating INTEGER DEFAULT 0;
ALTER TABLE contract_obligations ADD COLUMN recurrence_interval INTEGER;
ALTER TABLE contract_obligations ADD COLUMN parent_obligation_id INTEGER REFERENCES contract_obligations(id);
```

`parent_obligation_id` links each auto-created copy back to its parent. It is the sole mechanism used to detect whether a copy already exists — before spawning, the system checks for any obligation with `parent_obligation_id = <this id>`.

### `insertObligation` signature extension

Add four new named parameters: `startDate`, `isRepeating`, `recurrenceInterval`, `parentObligationId`. All default to `null` / `0` when omitted, so existing callers (AI path) require no changes.

The updated INSERT adds these four columns after `stage` (the last existing column):

```
..., stage, start_date, is_repeating, recurrence_interval, parent_obligation_id
```

Values:
```
..., stage || "active", startDate || null, isRepeating ? 1 : 0, recurrenceInterval || null, parentObligationId || null
```

Full updated column list (24 total):
`document_id, obligation_type, title, description, clause_reference, due_date, recurrence, notice_period_days, owner, escalation_to, proof_description, evidence_json, category, department, activation, status, summary, details_json, penalties, stage, start_date, is_repeating, recurrence_interval, parent_obligation_id`

The VALUES array must have exactly 24 entries matching the column order above.

### `updateObligation` allowedFields extension

`updateObligation` in `lib/db.js` has a hardcoded `allowedFields` array. Add the four new column names to it: `"start_date"`, `"is_repeating"`, `"recurrence_interval"`, `"parent_obligation_id"`. Without this, PATCH calls that try to update these fields will silently do nothing.

---

## Section 3 — Auto-copy logic

### Trigger

The GET handler in `src/app/api/documents/[id]/obligations/route.ts` calls `spawnDueObligations(docId)` before fetching and returning obligations.

### `spawnDueObligations(documentId)` — new function in `lib/db.js`

Export this function from `lib/db.js` and add it to the re-export barrel at `src/lib/db-imports.ts`.

```
function spawnDueObligations(documentId):
  1. Fetch the parent contract using getContractById(documentId).
     If not found, or contract.status not in ["active", "signed"], return immediately.
  2. Get today's date as a YYYY-MM-DD string using UTC:
       new Date().toISOString().slice(0, 10)
  3. Loop (max 100 iterations to prevent runaway catch-up):
     a. Query: find obligations where
          document_id = documentId
          AND is_repeating = 1
          AND recurrence_interval IS NOT NULL
          AND due_date IS NOT NULL
          AND due_date < today
          AND NOT EXISTS (
            SELECT 1 FROM contract_obligations c2
            WHERE c2.parent_obligation_id = contract_obligations.id
          )
     b. If no results, break.
     c. For each qualifying obligation:
          - Compute next_due using UTC date arithmetic:
              const d = new Date(obligation.due_date + "T00:00:00Z");
              d.setUTCDate(d.getUTCDate() + obligation.recurrence_interval);
              const next_due = d.toISOString().slice(0, 10);
          - Call insertObligation with all fields copied from the parent, except:
              due_date             = next_due
              activation           = null        ← forces statusValue = "active" in insertObligation
              stage                = "active"
              parent_obligation_id = obligation.id
              evidence_json        = "[]"
              details_json         = "{}"
  4. Return (the updated list is fetched separately by the caller).
```

**`status` note:** `insertObligation` derives the `status` column from `activation` via `const statusValue = activation || "active"`. To ensure spawned children always have `status = "active"`, pass `activation: null` when calling `insertObligation` from `spawnDueObligations`. Do not pass the parent's `activation` value.

**Obligations with null `due_date`:** Excluded from spawning by the `due_date IS NOT NULL AND due_date < today` predicate. No separate guard is needed.

**Contract status check:** `getContractById` already exists and is exported from `@/lib/db-imports`. Check `contract.status` (the document's `status` column). Valid statuses for spawning: `"active"` and `"signed"`.

**Safety cap:** The outer loop runs at most 100 iterations total. Each iteration creates one generation of copies and re-queries — handling catch-up scenarios where the page hasn't been loaded in a long time.

### What gets copied

Every field from the parent obligation is copied to the child, with these overrides:

| Field | Value |
|-------|-------|
| `due_date` | parent `due_date` + `recurrence_interval` days |
| `status` | `"active"` |
| `stage` | `"active"` |
| `parent_obligation_id` | parent `id` |
| `evidence_json` | `"[]"` (fresh — no inherited evidence) |
| `details_json` | `"{}"` |
| `id` | auto-generated |
| `created_at` | auto-generated |

The parent obligation's status is not changed.

---

## Section 4 — TypeScript type update

Add four fields to the `Obligation` interface in `src/lib/types.ts`:

```ts
start_date: string | null;
is_repeating: number;           // 0 or 1
recurrence_interval: number | null;
parent_obligation_id: number | null;
```

---

## Section 5 — UI changes

### `ObligationFormCard` in `src/app/(app)/contracts/new/ContractsNewForm.tsx`

**`ObligationDraft` interface:** Remove `obligationType`, `noticePeriodDays`, `recurrence`, `activation`, `penalties`. Add `startDate: string`, `isRepeating: boolean`, `recurrenceInterval: string`.

**`makeObligation()` factory:** Initialize new fields: `startDate: ""`, `isRepeating: false`, `recurrenceInterval: ""`.

**`ObligationFormCard` renders (in order):**
1. Title (text, required)
2. Clause reference (text)
3. Due date (date)
4. Start date (date)
5. Repeating? (checkbox)
6. → Repeat every (select, only rendered when `isRepeating` is true): `""` placeholder + `"7"` / `"30"` / `"90"` / `"365"` with labels "7 days" / "30 days" / "90 days" / "365 days"
7. Owner (text)
8. Escalation to (text)
9. Category (select from `OBLIGATION_CATEGORIES`)
10. Department (select from `DEPARTMENTS`)
11. Description (textarea)
12. Summary (textarea)
13. Proof description (textarea)

**Checkbox wiring:** The `onChange` prop signature must accept `string | boolean` as its `value` parameter: `onChange: (key: string, field: keyof ObligationDraft, value: string | boolean) => void`. The checkbox renders as:
```tsx
<input
  type="checkbox"
  checked={obligation.isRepeating}
  onChange={(e) => onChange(obligation.key, "isRepeating", e.target.checked)}
/>
```
The parent's `handleObligationChange` must accept `value: string | boolean` and set the field accordingly.

**Form validation:** If `isRepeating` is `true` and `recurrenceInterval` is `""` when the user clicks Save, block submission with an inline error on the "Repeat every" field: "Please select a repeat interval."

**`handleSave` in `ContractsNewForm`:** When POSTing each obligation:
- Exclude `key` (UI-only, as before)
- Send `isRepeating` as a boolean
- Send `recurrenceInterval` as an integer (parse with `parseInt`; send `null` if empty or `isRepeating` is false)
- Do not send `obligationType`, `noticePeriodDays`, `recurrence`, `activation`, `penalties`

### `POST /api/documents/[id]/obligations` body changes

Remove: `obligationType` default-to-`"general"` logic is kept (column is NOT NULL — still default to `"general"` for backward compat even though the field is no longer sent from the manual form).

Add to destructuring and `insertObligation` call:
- `startDate` → `startDate`
- `isRepeating` → `isRepeating` (boolean → stored as 0/1)
- `recurrenceInterval` → already parsed int or null
- `parentObligationId` → `parentObligationId` (not sent from the form, but the endpoint accepts it for future use)

### `obligation-card.tsx` display changes

- Remove `penalties` section from display (if currently rendered).
- Remove `activation` from display (if currently rendered).
- Add `start_date` display field (label: "Start date") if non-null.
- Add recurrence summary if `is_repeating = 1`: display "Repeats every N days" using `recurrence_interval`.

---

## Section 6 — Out of scope

- No changes to AI extraction path (`lib/contracts.js`).
- No bulk retroactive migration of existing obligations to the new fields.
- No UI to view or manage the obligation chain (parent → child links).
- No notification when a new obligation copy is auto-created.
- No per-obligation override of the "active/signed contract" guard.
