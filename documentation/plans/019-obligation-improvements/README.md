# Plan: Obligation Improvements — Navigation, Category System, and View Redesign

> **Execute:** `/uc:plan-execution 019`
> Created: 2026-03-17
> Status: Draft
> Source: Feature Mode

## Objective

Three coordinated improvements to the obligations feature: (1) move obligations to a standalone page reachable only from the left sidebar (remove from contracts top-menu tab), (2) introduce a structured 4-category system where each category has typed fields the user fills in at creation time, (3) redesign the obligation card and view to be clean, readable, and immediately actionable — with a proper completion flow requiring a note or document.

## Context

- **Architecture:** [Database Schema](../../technology/architecture/database-schema.md) — `contract_obligations` table
- **Architecture:** [API Endpoints](../../technology/architecture/api-endpoints.md) — obligation routes
- **Requirements:** [Features](../../product/requirements/features.md) — Obligation Tracking section
- **Prior plans:** [013 — Contracts Tab Redesign](../013-contracts-tab-redesign/) | [016 — Obligation Fields Redesign](../016-obligation-fields-redesign/)

## Tech Stack

- Next.js 15 (App Router), TypeScript, React 19
- shadcn/ui (Radix UI + CVA), Tailwind v4, Lucide icons, Sonner toasts
- sql.js (WASM SQLite, in-memory, filesystem persistence)

## Scope

### In Scope

- Remove Obligations sub-tab from the contracts page; simplify contracts page to show contracts list directly (no tab switcher)
- Replace `/obligations/page.tsx` redirect with a real standalone page containing the full obligations view
- 4 new canonical categories: `payment`, `reporting`, `compliance`, `operational`
- Category migration map: `payments → payment`, `termination → operational`, `legal → compliance`, `others → operational`
- Category-specific typed DB columns via `ALTER TABLE` migrations:
  - `payment`: `payment_amount REAL`, `payment_currency TEXT`
  - `reporting`: `reporting_frequency TEXT`, `reporting_recipient TEXT`
  - `compliance`: `compliance_regulatory_body TEXT`, `compliance_jurisdiction TEXT`
  - `operational`: `operational_service_type TEXT`, `operational_sla_metric TEXT`
- Obligation creation form: category picker first (mandatory), then core fields + that category's specific fields
- Update `insertObligation`, `updateObligation` and `PATCH` allowlist to handle new typed columns
- Obligation card redesign: category badge, title, due date (overdue=red), status badge, "Complete" and "Evidence" buttons always visible on card surface
- Completion flow via a dialog: requires at minimum a note OR an attached document (both stored, both displayed on completed card)
- Fix `logAction()` double-serialization in `/api/obligations/[id]/finalize/route.ts` (pass plain object, not JSON.stringify)
- Standalone `/obligations` page: stats bar (active / overdue / upcoming), category + status filters, obligation list

### Out of Scope

- Adding obligations to an existing contract (post-creation) — no new "Add obligation" button on per-contract view
- Inline editing of obligation fields (replaced by the redesigned card with explicit edit mode)
- AI-based obligation extraction changes
- Obligation deletion UI
- The obligation finalize API itself — unchanged, only the UI calling it changes

## Success Criteria

- [ ] Navigating to `/obligations` shows the obligations page with stats and list (not a redirect to `/contracts`)
- [ ] The contracts page shows the contracts list directly with no Obligations tab
- [ ] Creating an obligation with category "payment" requires and saves `payment_amount` and `payment_currency`
- [ ] Creating an obligation with category "reporting" requires and saves `reporting_frequency` and `reporting_recipient`
- [ ] Existing obligations with old categories render correctly (category migration map applied in UI)
- [ ] Each obligation card shows category badge, title, due date (red if overdue), status, and "Complete" + "Evidence" buttons without expanding
- [ ] Clicking "Complete" opens a dialog; submitting without a note AND without a document shows a validation error
- [ ] After completing, the card shows the note and/or linked document
- [ ] `npm run build` passes with no TypeScript errors

## Task List

> Every task gets the full pipeline: planning -> impl -> review -> test.
> Tasks must deliver end-to-end testable user value — from database through backend to API/UI.

---

### Task 1: Navigation cleanup — standalone /obligations page + simplify contracts page

**Description:**

Two surgical changes to the navigation and page structure:

1. Replace `src/app/(app)/obligations/page.tsx` (currently `redirect('/contracts?tab=obligations')`) with a real page that renders the `ObligationsTab` component directly. The page should have a proper heading ("Obligations"), a stats bar using data from `/api/obligations?filter=all`, and the existing `ObligationsTab` content below.

2. Simplify `src/app/(app)/contracts/page.tsx` — remove the tab bar (the `<div className="flex gap-0 border-b">` with Contracts/Obligations links), remove the `ObligationsTab` import and the `activeTab` logic, and render `ContractsTab` directly inside the layout div. Remove the `Suspense` wrapper's dependency on `useSearchParams` — since there's no longer a tab param, a simple layout is sufficient.

No API changes. No component restructuring beyond wiring.

**Files to modify:**
- `src/app/(app)/obligations/page.tsx` (replace redirect with real page content)
- `src/app/(app)/contracts/page.tsx` (remove tab structure, render ContractsTab directly)

**Patterns:**
- `documentation/technology/standards/rest-api.md` — `export const runtime = "nodejs"` not needed for page components
- `documentation/technology/standards/design-system.md` — page layout conventions

**Success criteria:**
- `GET /obligations` renders the obligations page (heading "Obligations", stats, list) — NOT a redirect
- `GET /contracts` renders the contracts list directly with no Obligations tab visible
- Sidebar "Obligations" link navigates to a real page with content
- `npm run build` passes

**Dependencies:** None

---

### Task 2: Category system — 4 typed categories, DB columns, creation form

**Description:**

Introduce a structured 4-category system with typed DB columns per category. This replaces the current 4-category system (`payments`, `termination`, `legal`, `others`) with cleaner, more actionable categories.

**New categories:**

| Category | Display label | Category-specific fields |
|----------|--------------|--------------------------|
| `payment` | Payment | `payment_amount` (REAL), `payment_currency` (TEXT, default 'EUR') |
| `reporting` | Reporting | `reporting_frequency` (TEXT: monthly/quarterly/annually/ad-hoc), `reporting_recipient` (TEXT) |
| `compliance` | Compliance | `compliance_regulatory_body` (TEXT), `compliance_jurisdiction` (TEXT) |
| `operational` | Operational | `operational_service_type` (TEXT), `operational_sla_metric` (TEXT) |

**Database (lib/db.js):**
- Add 8 new columns via `ALTER TABLE` migrations in `initDb()` (after the existing migration block for `start_date`, `is_repeating`, etc.):
  ```sql
  payment_amount REAL
  payment_currency TEXT DEFAULT 'EUR'
  reporting_frequency TEXT
  reporting_recipient TEXT
  compliance_regulatory_body TEXT
  compliance_jurisdiction TEXT
  operational_service_type TEXT
  operational_sla_metric TEXT
  ```
- Update `insertObligation` to accept the 8 new fields (named-parameter destructuring, insert only non-null fields or pass all with defaults)
- Update `updateObligation` to include all 8 in the allowlist

**Type declarations:**
- `lib/db.d.ts` — add the 8 new columns to `insertObligation` and `updateObligation` parameter types
- `src/lib/db-imports.ts` — no changes needed (already re-exports these functions)
- `src/lib/types.ts` — add 8 new optional fields to the `Obligation` interface

**Constants (src/lib/constants.ts):**
- Replace `OBLIGATION_CATEGORIES = ["payments", "termination", "legal", "others"]` with `["payment", "reporting", "compliance", "operational"]`
- Update `CATEGORY_MIGRATION_MAP`: `payments → payment`, `termination → operational`, `legal → compliance`, `others → operational` (and keep legacy entries)
- Update `CATEGORY_COLORS` and `CATEGORY_BORDER_COLORS` for the 4 new categories with fresh distinct colors:
  - `payment`: purple (keep existing payments color)
  - `reporting`: amber
  - `compliance`: cyan (keep existing legal color)
  - `operational`: green
- Add `REPORTING_FREQUENCIES = ['monthly', 'quarterly', 'annually', 'ad-hoc'] as const`
- Add `INVOICE_CURRENCIES` already exists — reuse for `payment_currency` field

**API (src/app/api/obligations/[id]/route.ts):**
- Add all 8 new column names to the `PATCH` allowlist

**API (src/app/api/documents/[id]/obligations/route.ts):**
- Update `POST` handler to accept and pass the 8 new fields from the request body to `insertObligation`

**Creation form (src/app/(app)/contracts/new/ContractsNewForm.tsx):**
- Update `ObligationFormCard` component:
  - Category select is now the **first field** (required, no empty/blank default — user must choose)
  - After category is selected, show the category-specific fields below the core fields:
    - payment: Amount (number input) + Currency (select from INVOICE_CURRENCIES)
    - reporting: Frequency (select from REPORTING_FREQUENCIES) + Recipient (text)
    - compliance: Regulatory Body (text) + Jurisdiction (text)
    - operational: Service Type (text) + SLA Metric (text)
  - Core fields (always shown): Title (required), Due Date (required), Start Date, Owner, Description
  - Repeating section (Repeat Every N days) remains unchanged
  - Remove the `field("Category", "category", "select", OBLIGATION_CATEGORIES)` call and replace with the new category-first pattern
- Update `ObligationDraft` interface to include the 8 new optional fields
- Update the obligation POST payload in form submission to include the 8 new fields

**Files to create/modify:**
- `lib/db.js` (modify — add 8 columns + update insertObligation/updateObligation)
- `lib/db.d.ts` (modify — update type declarations)
- `src/lib/types.ts` (modify — add 8 fields to Obligation)
- `src/lib/constants.ts` (modify — new categories, colors, migration map, REPORTING_FREQUENCIES)
- `src/app/api/obligations/[id]/route.ts` (modify — expand PATCH allowlist)
- `src/app/api/documents/[id]/obligations/route.ts` (modify — accept new fields in POST)
- `src/app/(app)/contracts/new/ContractsNewForm.tsx` (modify — category-first form with typed fields)

**Patterns:**
- `documentation/technology/standards/database.md` — ALTER TABLE migration pattern, parameterized queries
- `documentation/technology/standards/rest-api.md` — PATCH allowlist pattern, POST body handling
- `documentation/technology/standards/module-separation.md` — lib/db.js → src/lib/db-imports.ts bridge

**Success criteria:**
- Creating an obligation with category "payment" shows amount + currency fields; saving stores values in `payment_amount` and `payment_currency` columns
- Creating with "reporting" shows and saves frequency + recipient
- Creating with "compliance" shows and saves regulatory_body + jurisdiction
- Creating with "operational" shows and saves service_type + sla_metric
- Obligations with old categories (`payments`, `termination`, `legal`, `others`) still render correctly (migration map applied)
- `PATCH /api/obligations/[id]` with `{ payment_amount: 5000, payment_currency: "USD" }` updates those fields
- `npm run build` passes

**Dependencies:** None

---

### Task 3: Obligation card and view redesign

**Description:**

Redesign the `ObligationCard` component for clarity and immediate actionability, and create a proper "Complete Obligation" dialog. Also redesign the standalone `/obligations` page layout.

**Obligation card redesign (`src/components/obligations/obligation-card.tsx`):**

The card has two states: **surface** (always visible) and **expanded** (on click).

**Surface (always visible):**
- Left accent border in category color (keep existing `border-l-4` pattern)
- Row layout: `[category badge] [title, bold] [spacer] [due date chip, red if overdue] [status badge] [Evidence button] [Complete button]`
- Due date chip: gray text normally; amber if due within 7 days; red + "Overdue" prefix if past due and not met
- "Complete" button: disabled and shows "Completed" state if `status === 'met' || status === 'finalized'`
- "Evidence" button: icon-only (`Paperclip` from Lucide), opens `EvidenceDialog`
- A "›" chevron indicates the card is expandable; clicking anywhere on the card body toggles expand

**Expanded section:**
- Core info: Owner, Description (if set), Clause reference (if set)
- Category-specific fields section: rendered based on `category` value — show only the fields for that category (e.g., for payment: "Amount: €5,000 | Currency: EUR")
- Repeating info: if `is_repeating`, show "Repeats every N days"
- Evidence list: list of attached documents with name and a remove button
- Completion record (shown only if completed): green-tinted box with note text (if set) and document link (if set)
- AI compliance check button at the bottom of expanded section
- "Edit" button (small, secondary) that switches the card to edit mode for inline field editing

**Remove from existing card:**
- The inline-editable inputs directly in the card surface (move to edit mode)
- The payment schedule table from `details_json` (legacy — this data lived in details_json; no longer displayed)
- The `finalization_note` input at the bottom as a permanent visible element
- The complex `showFinalize` state flow — replaced by the Complete dialog

**Complete Obligation dialog (`src/components/obligations/complete-obligation-dialog.tsx`):**
- Radix Dialog (import from `@/components/ui/dialog`)
- Title: "Complete Obligation"
- Description: "Add a note or attach a document as proof of completion."
- Fields:
  - Comment textarea (labeled "Note", placeholder "Describe how this obligation was fulfilled…")
  - Document picker button: "Attach from library" → opens `EvidenceDialog` inline or a simplified document selector showing library documents
- Validation: at least one of note OR document must be provided. Show inline error if both are empty on submit.
- Submit button: "Mark as Complete" → calls `POST /api/obligations/[id]/finalize` with `{ note, documentId }` → on success: shows Sonner toast "Obligation completed", refreshes obligation
- On completion: obligation card shows `status = 'met'`, Complete button disabled with checkmark

**Fix logAction in finalize route (`src/app/api/obligations/[id]/finalize/route.ts`):**
- Change `logAction("obligation", id, "finalized", JSON.stringify({ note, documentId }))` to `logAction("obligation", id, "finalized", { note, documentId: documentId ?? null })`

**Standalone /obligations page layout (`src/app/(app)/obligations/page.tsx`):**
- Page heading: "Obligations" (h1)
- Stats bar: 4 chips — Active (count), Overdue (count, red), Upcoming 30d (count, amber), Completed (count)
- Filter bar: Category filter (all + 4 categories) + Status filter (all / active / met / waived)
- Obligation list from `ObligationsTab` (keep existing `UpcomingObligationsSection` + `PerContractObligations` structure, or simplify to a flat list filtered by category/status)
- The `ObligationsTab` component can be simplified now that it only lives on this page (remove any contracts-page-specific tab container it may have)

**Files to create/modify:**
- `src/components/obligations/obligation-card.tsx` (modify — full redesign)
- `src/components/obligations/complete-obligation-dialog.tsx` (create — completion dialog)
- `src/app/api/obligations/[id]/finalize/route.ts` (modify — fix logAction plain object)
- `src/app/(app)/obligations/page.tsx` (modify — replace redirect stub with real page, from Task 1)
- `src/components/contracts/obligations-tab.tsx` (modify — cleanup now that it's standalone only)

**Patterns:**
- `documentation/technology/standards/design-system.md` — Radix Dialog, AlertDialog for destructive, CVA badge variants, cn() utility
- `documentation/technology/standards/error-handling.md` — form validation, toast feedback
- `documentation/technology/standards/logging.md` — logAction plain objects

**Success criteria:**
- Each obligation card shows category badge, title, due date chip (red if overdue), status badge, Evidence icon button, and Complete button — all without expanding
- Complete button is disabled and shows a checkmark for already-completed obligations
- Clicking "Complete" opens a dialog; clicking "Mark as Complete" with both note and document empty shows a validation error
- Completing an obligation with a note stores the note and shows it in the expanded card
- Completing an obligation with a document stores the document_id and shows the document name/link in the expanded card
- `npm run build` passes

**Dependencies:** Task 2 (category-specific fields must be in the Obligation type before the card can display them)

---

## Documentation Changes

Documentation updated as part of Stage 4 pre-work (already on disk):

| File | Action | Summary |
|------|--------|---------|
| `documentation/technology/architecture/database-schema.md` | Updated | Refreshed contract_obligations table: new 4-category system, added 4 repeating columns (start_date, is_repeating, recurrence_interval, parent_obligation_id), corrected finalization notes |

Additional documentation to update during execution:

| File | Needed Change |
|------|--------------|
| `documentation/technology/architecture/api-endpoints.md` | Add the 8 new category-specific fields to the obligation POST/PATCH endpoint descriptions |
| `documentation/product/requirements/features.md` | Update Obligation Tracking section: new categories, completion flow, standalone page |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration map misses an edge case category string from AI extraction | Medium | Low | `CATEGORY_MIGRATION_MAP` in `constants.ts` already handles many legacy strings; the `|| "operational"` fallback catches unknowns |
| ObligationCard redesign breaks the per-contract view where it is also used | High | Medium | `ObligationCard` is used in `ContractObligationsRow` and on the standalone page — same component, same props. Redesign must preserve all existing callback props (onUpdateField, onAddEvidence, etc.) even if they move to an edit-mode flow |
| Complete dialog document picker UX — reusing EvidenceDialog vs inline selector | Medium | Low | EvidenceDialog already exists and handles document selection; the dialog can trigger it as a sub-flow rather than duplicating the list fetch |
| Removing tab switcher from contracts page breaks any bookmarked `/contracts?tab=obligations` URLs | Low | Low | Old URL still works as `/contracts` which now shows contracts (the default before); no redirect needed since the tab simply stops existing |
