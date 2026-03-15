# Contracts Tab Search & Filter Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove obligation count badges from contract cards and add dynamic search + multi-status-checkbox filtering to the Contracts tab.

**Architecture:** All filtering is client-side. `ContractsTab` owns `searchQuery` and `selectedStatuses` state, renders the search input and status checkboxes, and passes both values as props to `ContractList`. `ContractList` derives `filteredContracts` from the fetched array using a two-stage filter (status first, then search). No API changes.

**Tech Stack:** Next.js 14, React, TypeScript, shadcn/ui (`Input` from `@/components/ui/input`)

**Spec:** `docs/superpowers/specs/2026-03-15-contracts-tab-search-filter-design.md`

---

## Chunk 1: Remove obligation badges from ContractCard

### Task 1: Remove obligation badges from `contract-card.tsx`

**Files:**
- Modify: `src/components/contracts/contract-card.tsx`

**What to know before starting:**
- The obligation badge block is the `<div className="flex items-center gap-2 ml-4 flex-shrink-0">` section at lines ~146–159 in the current file. It contains two conditional badge elements: one for `activeObligations` (green) and one for `overdueObligations` (red).
- `AlertCircle` and `CheckCircle2` are imported from `lucide-react` only for these badges. Both must be removed from the import.
- The `activeObligations` and `overdueObligations` fields remain on the `Contract` type — do not touch the type. Only remove the rendered JSX and the icon imports.
- `Download` is also imported from lucide-react and is still used for the document download link — keep it.
- Current lucide import line (line 4): `import { ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Download } from "lucide-react";`

- [ ] **Step 1: Remove `AlertCircle` and `CheckCircle2` from lucide import**

Change line 4 from:
```tsx
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Download } from "lucide-react";
```
to:
```tsx
import { ChevronDown, ChevronRight, Download } from "lucide-react";
```

- [ ] **Step 2: Delete the obligation badges JSX block**

Remove the entire block (the flex div and its two children) from inside the collapsed header. The block to delete looks exactly like this:

```tsx
          {/* Obligation count badges */}
          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
            {contract.activeObligations > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-xs font-medium">
                <CheckCircle2 className="w-3 h-3" />
                {contract.activeObligations} Active
              </div>
            )}
            {contract.overdueObligations > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded text-xs font-medium">
                <AlertCircle className="w-3 h-3" />
                {contract.overdueObligations} Overdue
              </div>
            )}
          </div>
```

- [ ] **Step 3: Verify compilation**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add src/components/contracts/contract-card.tsx
git commit -m "feat: remove obligation count badges from contract card"
```

---

## Chunk 2: Add search & filter controls to ContractsTab and filtering logic to ContractList

### Task 2: Update `contracts-tab.tsx` with search and filter state + UI

**Files:**
- Modify: `src/components/contracts/contracts-tab.tsx`

**What to know before starting:**
- Current imports: `useState` from react, `Plus` from lucide-react, `ContractList`, `AddContractDialog`.
- Current state: `refreshTrigger: number`, `showAddDialog: boolean`.
- The `Input` component is at `@/components/ui/input` — import it.
- `CONTRACT_STATUS_DISPLAY` is exported from `@/lib/constants` — it is a `Record<string, string>` with keys `unsigned`, `signed`, `active`, `terminated`. Import it to drive the checkbox labels.
- `selectedStatuses` starts with all four status keys selected so nothing is hidden on initial load.
- The checkbox toggle logic: if the status is already in the array, remove it; otherwise add it.
- Layout: search bar and checkboxes go **below** the "All Contracts" heading + "Add New Contract" button row, and **above** the `<ContractList>`.

- [ ] **Step 1: Update imports**

Add `Input` and `CONTRACT_STATUS_DISPLAY` to the import list:

```tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ContractList } from "./contract-list";
import { AddContractDialog } from "./add-contract-dialog";
import { Input } from "@/components/ui/input";
import { CONTRACT_STATUS_DISPLAY } from "@/lib/constants";
```

- [ ] **Step 2: Add new state variables**

Inside `ContractsTab`, after the existing state declarations, add:

```tsx
const [searchQuery, setSearchQuery] = useState("");
const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
  Object.keys(CONTRACT_STATUS_DISPLAY)
);
```

`Object.keys(CONTRACT_STATUS_DISPLAY)` evaluates to `["unsigned", "signed", "active", "terminated"]` — all statuses selected by default.

- [ ] **Step 3: Add the toggle handler**

Below the state declarations, add:

```tsx
const toggleStatus = (status: string) => {
  setSelectedStatuses((prev) =>
    prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
  );
};
```

- [ ] **Step 4: Replace the JSX with the new layout**

Replace the entire `return` block with:

```tsx
return (
  <div className="space-y-4">
    {/* Header row */}
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold">All Contracts</h3>
      <button
        className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors"
        onClick={() => setShowAddDialog(true)}
      >
        <Plus className="w-4 h-4" />
        Add New Contract
      </button>
    </div>

    {/* Search + filter row */}
    <div className="space-y-2">
      <Input
        placeholder="Search by name or vendor…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {Object.entries(CONTRACT_STATUS_DISPLAY).map(([key, label]) => (
          <label key={key} className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={selectedStatuses.includes(key)}
              onChange={() => toggleStatus(key)}
              className="rounded border-input"
            />
            {label}
          </label>
        ))}
      </div>
    </div>

    <ContractList
      refreshTrigger={refreshTrigger}
      searchQuery={searchQuery}
      selectedStatuses={selectedStatuses}
    />

    <AddContractDialog
      open={showAddDialog}
      onOpenChange={setShowAddDialog}
      onSuccess={() => {
        setShowAddDialog(false);
        setRefreshTrigger((t) => t + 1);
      }}
    />
  </div>
);
```

Note: `space-y-6` on the outer div changed to `space-y-4` to tighten up the layout with the new controls.

- [ ] **Step 5: Verify compilation**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```
Expected: TypeScript errors on `ContractList` because it doesn't yet accept `searchQuery` and `selectedStatuses` props. That is expected — Task 3 fixes this.

If you see errors *only* on the `ContractList` prop types, proceed. If there are other errors, fix them before continuing.

- [ ] **Step 6: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add src/components/contracts/contracts-tab.tsx
git commit -m "feat: add search bar and status filter to contracts tab"
```

---

### Task 3: Add filtering logic to `contract-list.tsx`

**Files:**
- Modify: `src/components/contracts/contract-list.tsx`

**What to know before starting:**
- Current `ContractListProps` has only `refreshTrigger?: number`.
- Two new required props: `searchQuery: string` and `selectedStatuses: string[]`.
- `contract.status` is the status key string (e.g. `"active"`).
- `contract.name` is `string` (non-nullable).
- `contract.contracting_vendor` is `string | null` — must null-guard with `?? ""`.
- `contract.client` is `string | null` — must null-guard with `?? ""`.
- Filter order: status first, then search. Both filters must pass for a contract to be shown.
- Empty-selection rule: if `selectedStatuses` is empty, zero contracts pass the status filter (show nothing).
- Distinct empty states:
  - `contracts.length === 0`: "No contracts found. / Use "Add New Contract" to get started." (existing message)
  - `filteredContracts.length === 0` but `contracts.length > 0`: "No contracts match your search."
- `filteredContracts` is derived inline during render (not in a `useEffect`) — it is a pure computation from `contracts`, `searchQuery`, and `selectedStatuses`.
- **Sequencing is critical:** the `filteredContracts` derivation (Step 3) must appear in the file *before* the empty-state checks and render (Step 4). Follow the steps in order.

- [ ] **Step 1: Update `ContractListProps`**

Replace:
```tsx
interface ContractListProps {
  /** Increment to trigger a re-fetch of the contract list */
  refreshTrigger?: number;
}
```
with:
```tsx
interface ContractListProps {
  /** Increment to trigger a re-fetch of the contract list */
  refreshTrigger?: number;
  searchQuery: string;
  selectedStatuses: string[];
}
```

- [ ] **Step 2: Destructure the new props**

Change the function signature from:
```tsx
export function ContractList({ refreshTrigger }: ContractListProps) {
```
to:
```tsx
export function ContractList({ refreshTrigger, searchQuery, selectedStatuses }: ContractListProps) {
```

- [ ] **Step 3: Add the filtering derivation**

After the `useEffect` block and before the loading/empty state checks, add:

```tsx
const q = searchQuery.trim().toLowerCase();
const filteredContracts = contracts
  .filter((c) => selectedStatuses.includes(c.status))
  .filter((c) => {
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.contracting_vendor ?? "").toLowerCase().includes(q) ||
      (c.client ?? "").toLowerCase().includes(q)
    );
  });
```

- [ ] **Step 4: Update the empty state and render**

Replace the current empty-state check and render:

```tsx
  if (contracts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No contracts found.</p>
        <p className="text-sm mt-1">Use "Add New Contract" to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {contracts.map((contract) => (
        <ContractCard
          key={contract.id}
          contract={contract}
          onContractUpdate={() => setCardRefresh((n) => n + 1)}
        />
      ))}
    </div>
  );
```

with:

```tsx
  if (contracts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No contracts found.</p>
        <p className="text-sm mt-1">Use "Add New Contract" to get started.</p>
      </div>
    );
  }

  if (filteredContracts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No contracts match your search.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filteredContracts.map((contract) => (
        <ContractCard
          key={contract.id}
          contract={contract}
          onContractUpdate={() => setCardRefresh((n) => n + 1)}
        />
      ))}
    </div>
  );
```

- [ ] **Step 5: Verify compilation**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add src/components/contracts/contract-list.tsx
git commit -m "feat: add search and status filter logic to contract list"
```
