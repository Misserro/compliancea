# Contracts Tab Redesign — Design Spec

**Date:** 2026-03-14
**Status:** Approved

---

## Overview

Redesign the `/contracts` page to split the current single "Contract Hub" view into two focused sub-tabs: **Contracts** and **Obligations**. Each sub-tab owns one concern, allowing details and actions to be presented with more prominence and clarity.

---

## Routing & Structure

- The `/contracts` page gains a tab bar at the top with two tabs: **Contracts** (default) and **Obligations**.
- Active tab is persisted in the URL via query param: `?tab=contracts` and `?tab=obligations`.
- If the query param is absent, malformed, or any value other than `obligations`, the Contracts tab is shown by default. Navigating via the sidebar link (which points to `/contracts` with no param) always opens the Contracts tab.
- The sidebar nav item remains "Contracts" — no sidebar changes.
- The `/obligations` route (`src/app/(app)/obligations/page.tsx`) is updated to redirect to `/contracts?tab=obligations` (currently redirects to plain `/contracts`).
- The page component reads the query param and renders either `<ContractsTab />` or `<ObligationsTab />`.
- The existing `upcoming-obligations-section.tsx` banner is removed from the Contracts tab and moves into the Obligations tab as its primary top section.
- Page heading: the current "Contract Hub" `h2` heading is replaced by the tab bar itself; no separate page heading is needed.

---

## Contracts Sub-tab

The `contracts-tab.tsx` wrapper component owns the `refreshTrigger` state (a counter incremented after any action that should reload the contract list). It passes `refreshTrigger` down to `ContractList` as a prop.

### Collapsed Card State

Each contract card in the collapsed state shows:
- Contract name
- Status badge (display names: Inactive / To Sign / Active / Terminated — never raw values like `unsigned`)
- Expiry date
- Obligation count badges (active / overdue) — sourced from `GET /api/contracts` response fields `activeObligations` and `overdueObligations`

Status transition buttons are **not shown** in the collapsed state — they are only visible in the expanded view.

### Expanded Card State — Two-column Layout

The expanded card interior uses a two-column layout.

**Left column — Contract Details:**
- Editable metadata fields mapping to the five fields accepted by `PATCH /api/contracts/[id]`: contracting company (`contracting_company`), vendor (`contracting_vendor`), signature date (`signature_date`), commencement date (`commencement_date`), expiry date (`expiry_date`)
- Document section: `contract.name` shown as a download link pointing to `GET /api/documents/[id]/download` (the contract name already appears in the card header so this is the file-download affordance for it)

**Right column — Status & Actions:**
- A horizontal status strip showing all four lifecycle states as pill/step indicators using display names from `CONTRACT_STATUS_DISPLAY`: `Inactive → To Sign → Active → Terminated` (raw values `unsigned / signed / active / terminated` are never shown in the UI)
- The strip highlighting maps display names to raw status values via `CONTRACT_STATUS_DISPLAY` to determine which pill is current
- The current status pill is highlighted; other states are muted
- Available forward and backward transitions shown as prominent buttons beneath the strip, using the existing arrow-prefixed labels from `STATUS_ACTIONS` (e.g., "→ To Sign", "← Inactive") — label strings are not changed
- Destructive actions (Terminate, Reactivate) retain their existing confirmation dialogs

### Add New Contract Flow

An "Add New Contract" button is shown at the top of the contract list. Clicking it opens a two-step dialog:

**Step 1 — Upload:**
- File input (PDF/DOCX, max 10MB — constraints enforced by the upload endpoint)
- A "Category" dropdown with fixed values: Finance, Compliance, Operations, HR, Board, IT (maps to the `category` field on `POST /api/documents/upload`)
- On confirm: calls `POST /api/documents/upload`
- On error: inline error message with a "Retry" option; dialog stays open

**Step 2 — Process (automatic, loading state):**
- Triggered automatically after successful upload
- Calls `POST /api/documents/[id]/process`
- The process endpoint automatically detects contract documents (by `doc_type`), extracts text, auto-tags metadata, and extracts obligations via AI in a single call — **no separate analyze-contract call is made** (calling both would duplicate obligations)
- User sees a progress indicator: "Processing contract…"
- On success: success message "Contract added — X obligations extracted" where X is `response.contract.obligations.length`; dialog auto-closes after 2 seconds; contract list refreshes
- On error: inline error message with a "Retry" button; user can retry processing without re-uploading

The dialog cannot be dismissed during Step 2. The user does not manually advance between steps.

### Document Replace

Replacing the file attached to an existing contract (via the versioning system) involves obligation re-linking complexity and is **out of scope** for this redesign. The expanded card left column shows the current document name as a download link only — no replace/upload button for existing contracts.

### Obligation Loading in Contract List

The `contract-list.tsx` component currently pre-loads obligations alongside contract data. With the Contracts sub-tab no longer showing obligations inside expanded cards, **obligation pre-loading is removed from `contract-list.tsx`**. The following are removed from `contract-card.tsx`:
- `obligations` prop
- `onObligationUpdate` prop
- Status filter state (the Active/Inactive/Finalized/All tab bar)
- `EvidenceDialog`
- The entire obligation list rendering section

Obligation counts in the collapsed card header (active/overdue) are sourced from `GET /api/contracts` response fields only — not from the removed pre-loading.

### Removed from Contracts Sub-tab

- Inline obligations section in expanded contract cards
- 30-day upcoming obligations horizontal scroll banner

---

## Obligations Sub-tab

### Top Section — Upcoming Obligations (Primary Focus)

A prominent card grid showing all obligations due in the next 30 days across all contracts. Data from `GET /api/contracts/upcoming`.

Each card displays:
- Obligation title
- Category badge (color-coded: payments / termination / legal / others)
- Due date
- Source contract name (`document_name` field on the Obligation object)

Cards are sorted by due date ascending (most urgent first).

**Category filter bar** above the grid: All / Payments / Termination / Legal / Others (default: All). Filters the upcoming grid client-side.

**Empty states:**
- "No upcoming obligations in the next 30 days" (no category selected or All selected)
- "No upcoming [category] obligations" (category selected)

### Bottom Section — Per-contract Breakdown

A list of collapsible contract rows. Collapsed row shows: contract name, status badge, obligation counts (active / overdue / finalized) sourced from `GET /api/contracts` response.

Expanding a contract row lazy-loads its obligations via `GET /api/documents/[id]/obligations` on first expand (not pre-fetched). A loading skeleton is shown during the fetch. The full obligation array is returned by the endpoint; all tab and category filtering is applied **client-side** on this array.

**Tab filter — Active / Inactive / Finalized / All** (consistent with existing `contract-card.tsx` behavior, filtered on `status` field only):
- Active → `status === "active"`
- Inactive → `status === "inactive"`
- Finalized → `status === "finalized"` (matches what `finalizedObligations` counts in `GET /api/contracts`)
- All → no filter

**Category filter bar** above the per-contract list (independent from upcoming section filter): All / Payments / Termination / Legal / Others (default: All). Applies to all currently-expanded rows simultaneously, client-side. Does not affect collapsed rows — collapsed rows always show total counts regardless of selected category.

**Empty state per row:** "No [category] obligations for this contract" when a category filter yields no results in an expanded row.

### Filter Independence

The upcoming section category filter and the per-contract breakdown category filter are fully independent — changing one does not affect the other.

### Obligation Action Refresh

When a user takes an action on an obligation in the Obligations sub-tab (e.g., finalizes it), the collapsed-row obligation counts (sourced from `GET /api/contracts`) become stale. This is acceptable — counts refresh the next time `GET /api/contracts` is called (e.g., on tab switch or page reload). The `ObligationsTab` does **not** need to trigger a global contract list refresh; staleness of summary counts within a single Obligations tab session is tolerable.

---

## Data & API

No new API endpoints required.

| Endpoint | Used by |
|---|---|
| `GET /api/contracts` | Both sub-tabs — contract list with obligation counts |
| `PATCH /api/contracts/[id]` | Contracts sub-tab — metadata edits (5 fields) |
| `POST /api/documents/[id]/contract-action` | Contracts sub-tab — status transitions |
| `GET /api/documents/[id]/download` | Contracts sub-tab — document download link |
| `POST /api/documents/upload` | Add New Contract — step 1 |
| `POST /api/documents/[id]/process` | Add New Contract — step 2 (also extracts obligations) |
| `GET /api/contracts/upcoming` | Obligations sub-tab — upcoming grid |
| `GET /api/documents/[id]/obligations` | Obligations sub-tab — per-contract breakdown (all obligations, filtered client-side) |

---

## Components

| New / Changed | Component | Notes |
|---|---|---|
| Changed | `src/app/(app)/contracts/page.tsx` | Add tab bar; render `<ContractsTab />` or `<ObligationsTab />` based on `?tab` query param; default to Contracts tab |
| Changed | `src/app/(app)/obligations/page.tsx` | Update redirect target from `/contracts` to `/contracts?tab=obligations` |
| New | `src/components/contracts/contracts-tab.tsx` | Contracts sub-tab wrapper; owns `refreshTrigger` state; renders contract list and Add New Contract button |
| Changed | `src/components/contracts/contract-list.tsx` | Remove obligation pre-loading; `refreshTrigger` prop remains, now passed from `contracts-tab.tsx` |
| Changed | `src/components/contracts/contract-card.tsx` | Two-column expanded state; remove `obligations` prop, `onObligationUpdate` prop, status filter tabs, `EvidenceDialog`, and obligation list rendering |
| New | `src/components/contracts/add-contract-dialog.tsx` | Two-step dialog: upload (step 1) → process (step 2, auto) |
| New | `src/components/contracts/obligations-tab.tsx` | Obligations sub-tab wrapper |
| Changed | `src/components/contracts/upcoming-obligations-section.tsx` | Move to Obligations sub-tab; redesign from horizontal scroll to card grid; add category filter |
| New | `src/components/contracts/per-contract-obligations.tsx` | Collapsible per-contract breakdown; lazy-loads on first expand; Active/Inactive/Finalized/All tabs (status-based); category filter received as prop from `obligations-tab.tsx` |

---

## Out of Scope

- No changes to `obligation-card.tsx` internals — obligation editing, evidence, and finalization flows are unchanged
- No sidebar navigation changes
- No new API endpoints
- No changes to contract status transition logic or obligation activation/deactivation logic
- Document replacement / versioning (`set-replacement` flow) is out of scope — expanded card shows download link only
- Re-analysis of obligations after any document change is out of scope
