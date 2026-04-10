# Plan 059 — Bulk Action & Progress Bar Fixes

## Overview

Three bugs introduced or exposed by Plan 057 (bulk actions + progress bar):

1. **Bug 1 — Progress bar stuck after processing** — The processing progress bar on the contracts list page does not disappear after batch processing completes. Root cause: no `try/finally` wrapping the cleanup calls (`setProcessingProgress(null)` + `clearSelection()`). If any unexpected error occurs after the loop, the bar stays pinned at 100% with no escape valve.

2. **Bug 2 — No progress bar on documents tab** — When bulk processing documents from the documents library tab, no progress bar appears. The `ContractBulkActionBar` progress UI is exclusive to the contracts tab. The documents library has no per-item progress tracking — only button disabled state and start/end toasts. Fix: extract a shared `<ProcessingProgressBar />` component and add `ProcessingProgress` state + sequential-per-item processing to the documents library page.

3. **Bug 3 — Bulk status change silently skips cross-step transitions** — `CONTRACT_STATUS_ACTION_MAP` only has adjacent transitions. Selecting "Active" for an "Inactive" (`unsigned`) contract yields `undefined`, which `handleBulkStatusChange` silently counts as `skipped`. The API and DB layer already support all cross-step transitions (`transitionObligationsByStage` ignores `previousStage` — it deactivates ALL non-target stages). Fix: add missing cross-step entries to the map.

## Architecture

- **`src/components/contracts/contracts-tab.tsx`** — `handleBatchProcess` (Bug 1 fix)
- **`src/components/ui/processing-progress-bar.tsx`** — new shared component (Bug 2)
- **`src/components/contracts/contract-bulk-action-bar.tsx`** — use shared component (Bug 2)
- **`src/app/(app)/documents/library/page.tsx`** — add progress state + sequential loop (Bug 2)
- **`src/components/documents/action-bar.tsx`** — accept + render progress bar (Bug 2)
- **`src/lib/constants.ts`** — `CONTRACT_STATUS_ACTION_MAP` cross-step entries (Bug 3)

## Tech Stack

- React 18 — state, hooks, useCallback
- Next.js App Router — client components
- Tailwind CSS + shadcn/ui `<Progress />`
- TypeScript

## Concurrency

3 tasks. All three are independent — no cross-dependencies.

## Task Dependency Graph

- Task 1 (progress bar cleanup): no dependencies
- Task 2 (documents progress bar): no dependencies
- Task 3 (cross-step transitions): no dependencies

---

## Tasks

### Task 1 — Defensive cleanup for processing progress bar

**Description:**
`handleBatchProcess` in `contracts-tab.tsx` sets `processingProgress({ active: true, ... })` before the loop but only resets it with `setProcessingProgress(null)` + `clearSelection()` in the happy path after the loop. There is no `try/finally` — if any exception escapes the loop body or the toast/translation calls after the loop, the bar stays active permanently with no way to dismiss it.

**Changes to `src/components/contracts/contracts-tab.tsx`:**

Wrap the entire body of `handleBatchProcess` (after the early return) in a `try/finally`:

```ts
try {
  // existing loop + toast logic
} finally {
  setProcessingProgress(null);
  clearSelection();
  refreshContracts();
}
```

Move `setProcessingProgress(null)`, `clearSelection()`, and `refreshContracts()` from after the loop into the `finally` block. Remove them from the `try` body. The toast calls stay inside `try`.

**Files:**
- `src/components/contracts/contracts-tab.tsx` (lines 176-210)

**Success criteria:**
- Progress bar disappears after all contracts are processed (happy path)
- Progress bar disappears even if an unhandled exception occurs mid-processing
- `clearSelection()` and `refreshContracts()` always run
- TypeScript clean (`npx tsc --noEmit`)
- Build passes (`npx next build`)

**Regression criteria:**
- Progress tracking still works (current/total/name advance per item)
- Toast messages (success/warning) still show after processing

---

### Task 2 — Processing progress bar for documents library tab

**Description:**
The documents library tab processes documents in bulk via `handleProcessAll` in `library/page.tsx` but has no progress bar — only button disable state and start/end toasts. Add the same progress bar experience as the contracts tab.

**Step 1 — Extract shared `<ProcessingProgressBar />`:**

Create `src/components/ui/processing-progress-bar.tsx` — a standalone component that renders the progress UI. Props interface:

```ts
interface ProcessingProgressBarProps {
  processingProgress: ProcessingProgress | null;
}
```

Render the progress section currently inside `ContractBulkActionBar` (lines 61-75):
- "Processing X of Y: contractName" label
- percentage readout
- `<Progress value={...} />`
- `isVisible` logic: show only when `processingProgress?.active === true`
- Same `fixed bottom-0 ... translate-y` animation as the current bar

**Step 2 — Update `ContractBulkActionBar`:**

Import and use `<ProcessingProgressBar processingProgress={processingProgress} />` in the progress mode branch (replacing the inline progress JSX). Keep all other existing behavior unchanged.

**Step 3 — Add progress state to `documents/library/page.tsx`:**

1. Import `ProcessingProgress` type (or redeclare locally matching the interface).
2. Add `const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null)` state.
3. Rewrite `handleProcessAll` to process documents **sequentially** (same pattern as `handleBatchProcess` in contracts tab): iterate over eligible documents one at a time, update `processingProgress` per item, wrap in try/finally to always reset state.
4. Pass `processingProgress` to `<ActionBar />`.
5. Mount `<ProcessingProgressBar processingProgress={processingProgress} />` at the bottom of the page JSX.

**Step 4 — Update `action-bar.tsx`:**

Accept `processingProgress: ProcessingProgress | null` prop. Disable the process button when `processingProgress?.active === true` (same guard as `statusChangeInProgress` pattern in contracts).

**Files:**
- `src/components/ui/processing-progress-bar.tsx` (new)
- `src/components/contracts/contract-bulk-action-bar.tsx` (use shared component)
- `src/app/(app)/documents/library/page.tsx` (progress state + sequential loop)
- `src/components/documents/action-bar.tsx` (accept progress prop)

**Success criteria:**
- Progress bar appears at the bottom of the documents library page during bulk processing
- Bar shows current/total count and document name per item
- Bar disappears after all documents are processed
- Progress bar also works correctly on the contracts tab (no regression)
- TypeScript clean, build passes

**Regression criteria:**
- Existing documents library bulk processing (succeeded/failed toasts) still works
- Existing contracts tab progress bar still works
- Button disable state during processing still works on both pages

---

### Task 3 — Cross-step bulk status transitions

**Description:**
`CONTRACT_STATUS_ACTION_MAP` in `src/lib/constants.ts` only has adjacent transitions. Selecting "Active" (target) for a contract currently "Inactive" (`unsigned`) yields `undefined` in `handleBulkStatusChange`, which silently counts the contract as `skipped`.

The API route (`contract-action/route.ts`) already supports all needed actions. The DB function `transitionObligationsByStage` ignores its `previousStage` parameter — it deactivates ALL stages other than `newStage` regardless. Cross-step transitions are safe.

**Changes to `src/lib/constants.ts` — `CONTRACT_STATUS_ACTION_MAP`:**

Add missing cross-step entries:

```ts
export const CONTRACT_STATUS_ACTION_MAP: Record<string, Record<string, string>> = {
  unsigned: {
    signed: "sign",
    active: "activate",      // NEW — skip directly to active
    terminated: "terminate", // NEW — skip directly to terminated
  },
  signed: {
    unsigned: "unsign",
    active: "activate",
    terminated: "terminate", // NEW — skip directly to terminated
  },
  active: {
    signed: "deactivate",
    terminated: "terminate",
    unsigned: "unsign",      // NEW — revert all the way back to unsigned
  },
  terminated: {
    active: "reactivate",
    signed: "deactivate",    // NEW — revert to signed
    unsigned: "unsign",      // NEW — revert all the way to unsigned
  },
};
```

No API changes needed. No DB changes needed.

**Files:**
- `src/lib/constants.ts` (lines 61-66)

**Success criteria:**
- Selecting "Active" for an "Inactive" contract in bulk status change applies the transition (not silently skipped)
- Selecting "Inactive" for a "Terminated" contract applies the transition
- All previously working adjacent transitions still work
- TypeScript clean, build passes

**Regression criteria:**
- `handleBulkStatusChange` still correctly counts `alreadyAtTarget`, `skipped` (already-at-target is still handled separately)
- Obligation stage transitions fire correctly for cross-step actions (activates new stage, deactivates all others)
