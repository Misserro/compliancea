# Contracts Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the `/contracts` page into two focused sub-tabs — Contracts (enriched card view) and Obligations (upcoming grid + per-contract breakdown) — replacing the current single "Contract Hub" view.

**Architecture:** A tab bar driven by `?tab=` query param renders either `<ContractsTab />` or `<ObligationsTab />`. Contracts tab keeps expandable cards with a redesigned two-column expanded state (metadata left, status strip + actions right). Obligations tab has a prominent upcoming-obligations grid at top and a lazy-loading per-contract breakdown below.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS, Sonner toasts, Lucide icons. No new API endpoints — all existing endpoints are reused.

**Note on testing:** This project has no test framework configured. Verification steps use `npm run build` for TypeScript correctness and browser inspection for visual correctness.

**Spec:** `docs/superpowers/specs/2026-03-14-contracts-tab-redesign.md`

---

## Chunk 1: Routing & Tab Bar

### Task 1: Update obligations redirect + add tab bar to contracts page

**Files:**
- Modify: `src/app/(app)/obligations/page.tsx`
- Modify: `src/app/(app)/contracts/page.tsx`

- [ ] **Step 1: Update obligations redirect**

Replace `src/app/(app)/obligations/page.tsx` entirely:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ObligationsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/contracts?tab=obligations");
  }, [router]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <p className="text-sm text-muted-foreground">Redirecting to Obligations…</p>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite contracts page with tab bar**

Important: `useSearchParams()` requires a `<Suspense>` boundary around the component that calls it. The correct structure is: `ContractsPage` (default export, no hooks) wraps `ContractsPageContent` in `<Suspense>`. `ContractsPageContent` calls `useSearchParams`. The stubs created in Step 3 must NOT call `useSearchParams` — only the final `ContractsPageContent` does.

Replace `src/app/(app)/contracts/page.tsx` entirely:

```tsx
"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ContractsTab } from "@/components/contracts/contracts-tab";
import { ObligationsTab } from "@/components/contracts/obligations-tab";

function ContractsPageContent() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") === "obligations" ? "obligations" : "contracts";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Tab bar */}
      <div className="flex gap-0 border-b">
        <Link
          href="/contracts?tab=contracts"
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "contracts"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Contracts
        </Link>
        <Link
          href="/contracts?tab=obligations"
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "obligations"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Obligations
        </Link>
      </div>

      {activeTab === "contracts" ? <ContractsTab /> : <ObligationsTab />}
    </div>
  );
}

export default function ContractsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <ContractsPageContent />
    </Suspense>
  );
}
```

- [ ] **Step 3: Create placeholder stubs for the two new tab components** (must be done before Step 4 so the build passes — these are replaced with full implementations in Tasks 2 and 6)

Create `src/components/contracts/contracts-tab.tsx`:
```tsx
"use client";
export function ContractsTab() {
  return <div className="text-sm text-muted-foreground">Contracts tab — coming soon</div>;
}
```

Create `src/components/contracts/obligations-tab.tsx`:
```tsx
"use client";
export function ObligationsTab() {
  return <div className="text-sm text-muted-foreground">Obligations tab — coming soon</div>;
}
```

- [ ] **Step 4: Verify TypeScript build passes**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors (Next.js build may warn about other things but should not error on the new files).

- [ ] **Step 5: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add src/app/\(app\)/contracts/page.tsx src/app/\(app\)/obligations/page.tsx src/components/contracts/contracts-tab.tsx src/components/contracts/obligations-tab.tsx
git commit -m "feat: add tab bar to contracts page, update obligations redirect"
```

---

## Chunk 2: Contracts Sub-tab — Wrapper & List Cleanup

### Task 2: Create contracts-tab.tsx and clean up contract-list.tsx

**Files:**
- Modify: `src/components/contracts/contracts-tab.tsx` (replace stub)
- Modify: `src/components/contracts/contract-list.tsx`
- Modify: `src/components/contracts/add-contract-dialog.tsx` (stub, implemented in Task 4)

- [ ] **Step 1: Add stub for add-contract-dialog** (needed by contracts-tab.tsx)

Create `src/components/contracts/add-contract-dialog.tsx`:
```tsx
"use client";

interface AddContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddContractDialog({ open, onOpenChange }: AddContractDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-lg p-6 w-full max-w-md">
        <p className="text-sm text-muted-foreground">Add contract dialog — coming soon</p>
        <button onClick={() => onOpenChange(false)} className="mt-4 text-sm underline">Close</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement contracts-tab.tsx**

Replace `src/components/contracts/contracts-tab.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ContractList } from "./contract-list";
import { AddContractDialog } from "./add-contract-dialog";

export function ContractsTab() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <div className="space-y-6">
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

      <ContractList refreshTrigger={refreshTrigger} />

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
}
```

- [ ] **Step 3: Clean up contract-list.tsx — remove obligation pre-loading**

Replace `src/components/contracts/contract-list.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import type { Contract } from "@/lib/types";
import { ContractCard } from "./contract-card";
import { Skeleton } from "@/components/ui/skeleton";

interface ContractListProps {
  refreshTrigger?: number;
}

export function ContractList({ refreshTrigger }: ContractListProps) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  const loadContracts = async () => {
    try {
      const res = await fetch("/api/contracts");
      if (res.ok) {
        const data = await res.json();
        setContracts(data.contracts || []);
      } else {
        toast.error("Failed to load contracts");
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContracts();
  }, [refreshTrigger]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

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
          onContractUpdate={loadContracts}
        />
      ))}
    </div>
  );
}
```

Note: `ContractCard` now only receives `contract` and `onContractUpdate`. The old `obligations` and `onObligationUpdate` were optional props, so removing them from the call site does NOT cause a TypeScript error even before Task 3 narrows the interface. The build is safe at this commit point.

- [ ] **Step 4: Verify build after Task 3 completes (combined check)**

Hold the build check — run it at the end of Task 3, after `contract-card.tsx` is also updated.

- [ ] **Step 5: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add src/components/contracts/contracts-tab.tsx src/components/contracts/contract-list.tsx src/components/contracts/add-contract-dialog.tsx
git commit -m "feat: implement contracts-tab wrapper, remove obligation pre-loading from contract-list"
```

---

## Chunk 3: Contract Card Redesign

### Task 3: Rewrite contract-card.tsx with two-column expanded layout

**Files:**
- Modify: `src/components/contracts/contract-card.tsx`

- [ ] **Step 1: Replace contract-card.tsx**

Important: `STATUS_ORDER` (the ordered array for the status strip) and `STATUS_ACTIONS` (the transition button map) are **file-local constants** defined at the top of `contract-card.tsx`. They are NOT imported from `@/lib/constants`. Only `STATUS_COLORS` and `CONTRACT_STATUS_DISPLAY` are imported from constants. Action buttons and their `handleStatusAction` handler are rendered **only** inside the `{expanded && ...}` section — they are not present in the collapsed header at all.

Replace `src/components/contracts/contract-card.tsx` entirely:

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";
import type { Contract } from "@/lib/types";
import { STATUS_COLORS, CONTRACT_STATUS_DISPLAY } from "@/lib/constants";
import { ContractMetadataDisplay } from "./contract-metadata-display";

interface ContractCardProps {
  contract: Contract;
  onContractUpdate?: () => void;
}

const STATUS_ACTIONS: Record<
  string,
  Array<{ label: string; action: string; confirm?: boolean; variant: "forward" | "backward" }>
> = {
  unsigned: [{ label: "→ To Sign", action: "sign", variant: "forward" }],
  signed: [
    { label: "← Inactive", action: "unsign", variant: "backward" },
    { label: "→ Activate", action: "activate", variant: "forward" },
  ],
  active: [
    { label: "← To Sign", action: "deactivate", variant: "backward" },
    { label: "→ Terminate", action: "terminate", confirm: true, variant: "forward" },
  ],
  terminated: [{ label: "← Reactivate", action: "reactivate", confirm: true, variant: "backward" }],
};

const STATUS_ORDER = ["unsigned", "signed", "active", "terminated"] as const;

export function ContractCard({ contract, onContractUpdate }: ContractCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const statusColor = STATUS_COLORS[contract.status] || STATUS_COLORS.unsigned;
  const statusDisplay = CONTRACT_STATUS_DISPLAY[contract.status] || contract.status;
  const actions = STATUS_ACTIONS[contract.status] || [];

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const handleStatusAction = async (actionConfig: {
    label: string;
    action: string;
    confirm?: boolean;
  }) => {
    if (actionConfig.confirm) {
      const confirmed = window.confirm(
        actionConfig.action === "terminate"
          ? "Are you sure you want to terminate this contract? This will create a termination notice obligation with a 30-day deadline."
          : `Are you sure you want to ${actionConfig.label.replace(/[←→]\s*/, "")} this contract?`
      );
      if (!confirmed) return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/documents/${contract.id}/contract-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionConfig.action }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Contract action successful");
        onContractUpdate?.();
      } else {
        toast.error(data.error || "Action failed");
      }
    } catch (err) {
      toast.error(`Action failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMetadataSave = async (metadata: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/contracts/${contract.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata),
      });
      if (res.ok) {
        toast.success("Contract info updated");
        onContractUpdate?.();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update contract info");
      }
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  return (
    <div className="bg-card border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      {/* Collapsed header */}
      <div
        className="p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <button
              className="mt-1 text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
            >
              {expanded ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </button>

            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-semibold text-base">{contract.name}</h3>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>
                  {statusDisplay}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {contract.contracting_vendor || contract.client || "No vendor specified"}
                {contract.expiry_date && (
                  <span className="ml-2 text-xs">
                    · Expires {formatDate(contract.expiry_date)}
                  </span>
                )}
              </div>
            </div>
          </div>

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
        </div>
      </div>

      {/* Expanded two-column content */}
      {expanded && (
        <div className="border-t">
          <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-muted/30">
            {/* Left column: metadata + document download */}
            <div className="space-y-4">
              <ContractMetadataDisplay contract={contract} onSave={handleMetadataSave} />
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">Document</div>
                <a
                  href={`/api/documents/${contract.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="w-3.5 h-3.5" />
                  {contract.name}
                </a>
              </div>
            </div>

            {/* Right column: status strip + action buttons */}
            <div className="space-y-5">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">Contract Status</div>
                <div className="flex items-center gap-1 flex-wrap">
                  {STATUS_ORDER.map((s, i) => (
                    <div key={s} className="flex items-center gap-1">
                      <span
                        className={`px-2.5 py-1 rounded text-xs font-medium ${
                          s === contract.status
                            ? STATUS_COLORS[s]
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {CONTRACT_STATUS_DISPLAY[s]}
                      </span>
                      {i < STATUS_ORDER.length - 1 && (
                        <span className="text-muted-foreground text-xs">→</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {actions.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Actions</div>
                  <div className="flex flex-wrap gap-2">
                    {actions.map((actionConfig) => (
                      <button
                        key={actionConfig.action}
                        className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                          actionConfig.variant === "backward"
                            ? "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                            : actionConfig.confirm
                            ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800"
                            : "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800"
                        }`}
                        disabled={actionLoading}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStatusAction(actionConfig);
                        }}
                      >
                        {actionLoading ? "…" : actionConfig.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript build passes**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
npm run build 2>&1 | tail -30
```

Expected: build completes without TypeScript errors. If there are type errors related to `obligations` or `onObligationUpdate` props being passed somewhere still, search for remaining call sites:
```bash
grep -r "onObligationUpdate\|obligations={" src/components/contracts/ --include="*.tsx"
```
Fix any remaining callers by removing those props.

- [ ] **Step 3: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add src/components/contracts/contract-card.tsx
git commit -m "feat: redesign contract-card with two-column expanded layout, move actions to expanded view"
```

---

## Chunk 4: Add New Contract Dialog

### Task 4: Implement add-contract-dialog.tsx

**Files:**
- Modify: `src/components/contracts/add-contract-dialog.tsx` (replace stub from Task 2)

- [ ] **Step 1: Replace add-contract-dialog.tsx with full implementation**

Important: The `category` field on `POST /api/documents/upload` is validated against `DEPARTMENTS` on the server (`["Finance", "Compliance", "Operations", "HR", "Board", "IT"]`). Import `DEPARTMENTS` from `@/lib/constants` for the dropdown — do NOT use `OBLIGATION_CATEGORIES` or other lists.

```tsx
"use client";

import { useState, useRef } from "react";
import { X } from "lucide-react";
import { DEPARTMENTS } from "@/lib/constants";

interface AddContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type Step = "upload" | "processing" | "done" | "error-upload" | "error-process";

export function AddContractDialog({ open, onOpenChange, onSuccess }: AddContractDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [obligationsCount, setObligationsCount] = useState(0);
  const [documentId, setDocumentId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("upload");
    setFile(null);
    setCategory("");
    setError("");
    setObligationsCount(0);
    setDocumentId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    if (step === "processing") return; // cannot dismiss during processing
    reset();
    onOpenChange(false);
  };

  const handleProcess = async (docId: number) => {
    try {
      const res = await fetch(`/api/documents/${docId}/process`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Processing failed");

      const count: number = data.contract?.obligations?.length ?? 0;
      setObligationsCount(count);
      setStep("done");
      setTimeout(() => {
        reset();
        onSuccess();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed");
      setStep("error-process");
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setError("");

    const formData = new FormData();
    formData.append("file", file);
    if (category) formData.append("category", category);

    try {
      const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      const docId: number = data.document.id;
      setDocumentId(docId);
      setStep("processing");
      await handleProcess(docId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStep("error-upload");
    }
  };

  const handleRetryProcess = async () => {
    if (!documentId) return;
    setError("");
    setStep("processing");
    await handleProcess(documentId);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-md p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Add New Contract</h2>
          {step !== "processing" && (
            <button
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Step 1: Upload */}
        {(step === "upload" || step === "error-upload") && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Contract Document</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx"
                className="w-full text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-muted file:text-foreground hover:file:bg-muted/80"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground mt-1">PDF or DOCX, max 10 MB</p>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Category <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <select
                className="w-full px-2 py-1.5 border rounded text-sm bg-background"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Select category…</option>
                {DEPARTMENTS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={handleClose}
                className="px-3 py-1.5 text-sm border rounded hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!file}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Upload &amp; Process
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Processing */}
        {step === "processing" && (
          <div className="py-10 text-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Processing contract…</p>
            <p className="text-xs text-muted-foreground mt-1">This may take a moment.</p>
          </div>
        )}

        {/* Step 3: Done */}
        {step === "done" && (
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-green-600 dark:text-green-400">
              Contract added — {obligationsCount} obligation{obligationsCount !== 1 ? "s" : ""} extracted
            </p>
            <p className="text-xs text-muted-foreground mt-1">Closing…</p>
          </div>
        )}

        {/* Error: processing failed (document already uploaded) */}
        {step === "error-process" && (
          <div className="space-y-4">
            <p className="text-sm text-destructive">{error}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleClose}
                className="px-3 py-1.5 text-sm border rounded hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRetryProcess}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
              >
                Retry Processing
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript build**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add src/components/contracts/add-contract-dialog.tsx
git commit -m "feat: implement add-contract dialog with upload and auto-process steps"
```

---

## Chunk 5: Obligations Sub-tab — Upcoming Section

### Task 5: Redesign upcoming-obligations-section.tsx (grid + category filter)

**Files:**
- Modify: `src/components/contracts/upcoming-obligations-section.tsx`

- [ ] **Step 1: Replace upcoming-obligations-section.tsx**

```tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Calendar, FileText } from "lucide-react";
import type { Obligation } from "@/lib/types";
import { CATEGORY_COLORS, CATEGORY_MIGRATION_MAP, OBLIGATION_CATEGORIES } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";

export function UpcomingObligationsSection() {
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  useEffect(() => {
    async function loadUpcoming() {
      try {
        const res = await fetch("/api/contracts/upcoming");
        if (res.ok) {
          const data = await res.json();
          setObligations(data.obligations || []);
        } else {
          toast.error("Failed to load upcoming obligations");
        }
      } catch (err) {
        toast.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
      } finally {
        setLoading(false);
      }
    }
    loadUpcoming();
  }, []);

  const categories = ["all", ...OBLIGATION_CATEGORIES] as const;

  const filteredObligations = obligations.filter((ob) => {
    if (categoryFilter === "all") return true;
    const rawCategory = ob.category || "others";
    const cat = CATEGORY_MIGRATION_MAP[rawCategory] || rawCategory;
    return cat === categoryFilter;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays < 7) return `In ${diffDays} days`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const emptyMessage =
    categoryFilter === "all"
      ? "No upcoming obligations in the next 30 days."
      : `No upcoming ${categoryFilter} obligations.`;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Upcoming Obligations (Next 30 Days)</h3>

      {/* Category filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors capitalize ${
              categoryFilter === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : filteredObligations.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">{emptyMessage}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredObligations.map((ob) => {
            const rawCategory = ob.category || "others";
            const category = CATEGORY_MIGRATION_MAP[rawCategory] || rawCategory;
            const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.others;

            return (
              <div
                key={ob.id}
                className="bg-card border rounded-lg p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${categoryColor}`}>
                    {category}
                  </span>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {ob.due_date && formatDate(ob.due_date)}
                  </div>
                </div>
                <h4 className="font-medium text-sm mb-2 line-clamp-2">{ob.title}</h4>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <FileText className="w-3 h-3" />
                  <span className="truncate">{ob.document_name}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript build**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add src/components/contracts/upcoming-obligations-section.tsx
git commit -m "feat: redesign upcoming-obligations as card grid with category filter"
```

---

## Chunk 6: Per-contract Obligations & Obligations Tab

### Task 6: Create per-contract-obligations.tsx and implement obligations-tab.tsx

**Files:**
- Create: `src/components/contracts/per-contract-obligations.tsx`
- Modify: `src/components/contracts/obligations-tab.tsx` (replace stub)

- [ ] **Step 1: Create per-contract-obligations.tsx**

Important: The status tabs filter on `ob.status` exactly. Obligations with status `"met"`, `"waived"`, or `"failed"` will not appear in the Active, Inactive, or Finalized tabs — they only appear under "All". This is intentional per spec; the Finalized tab matches `status === "finalized"` only (consistent with the `finalizedObligations` count from `GET /api/contracts`).

Create `src/components/contracts/per-contract-obligations.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import type { Contract, Obligation } from "@/lib/types";
import { STATUS_COLORS, CONTRACT_STATUS_DISPLAY, CATEGORY_MIGRATION_MAP } from "@/lib/constants";
import { ObligationCard } from "../obligations/obligation-card";
import { EvidenceDialog } from "../obligations/evidence-dialog";
import { Skeleton } from "@/components/ui/skeleton";

interface PerContractObligationsProps {
  contracts: Contract[];
  categoryFilter: string;
}

interface ContractRowProps {
  contract: Contract;
  categoryFilter: string;
}

function ContractObligationsRow({ contract, categoryFilter }: ContractRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [evidenceDialogObligationId, setEvidenceDialogObligationId] = useState<number | null>(null);

  const statusColor = STATUS_COLORS[contract.status] || STATUS_COLORS.unsigned;
  const statusDisplay = CONTRACT_STATUS_DISPLAY[contract.status] || contract.status;

  const fetchObligations = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${contract.id}/obligations`);
      if (res.ok) {
        const data = await res.json();
        setObligations(data.obligations || []);
        setLoaded(true);
      }
    } catch (err) {
      console.error("Failed to load obligations:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !loaded) fetchObligations();
  };

  const refreshObligations = async () => {
    try {
      const res = await fetch(`/api/documents/${contract.id}/obligations`);
      if (res.ok) {
        const data = await res.json();
        setObligations(data.obligations || []);
      }
    } catch (err) {
      console.error("Failed to refresh obligations:", err);
    }
  };

  // Count per status tab (unfiltered by category)
  const activeCount = obligations.filter((ob) => ob.status === "active").length;
  const inactiveCount = obligations.filter((ob) => ob.status === "inactive").length;
  const finalizedCount = obligations.filter((ob) => ob.status === "finalized").length;

  // Apply status filter
  const statusFiltered =
    statusFilter === "all"
      ? obligations
      : obligations.filter((ob) => ob.status === statusFilter);

  // Apply category filter
  const displayed = statusFiltered.filter((ob) => {
    if (categoryFilter === "all") return true;
    const rawCategory = ob.category || "others";
    const cat = CATEGORY_MIGRATION_MAP[rawCategory] || rawCategory;
    return cat === categoryFilter;
  });

  const STATUS_TABS = [
    { key: "active", label: "Active", count: activeCount },
    { key: "inactive", label: "Inactive", count: inactiveCount },
    { key: "finalized", label: "Finalized", count: finalizedCount },
    { key: "all", label: "All", count: obligations.length },
  ];

  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      {/* Row header */}
      <div
        className="p-4 cursor-pointer flex items-center justify-between hover:bg-muted/30 transition-colors"
        onClick={handleExpand}
      >
        <div className="flex items-center gap-3">
          <button className="text-muted-foreground flex-shrink-0">
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          <span className="font-medium text-sm">{contract.name}</span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>
            {statusDisplay}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {contract.activeObligations > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-xs font-medium">
              <CheckCircle2 className="w-3 h-3" />
              {contract.activeObligations} Active
            </div>
          )}
          {contract.overdueObligations > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded text-xs font-medium">
              <AlertCircle className="w-3 h-3" />
              {contract.overdueObligations} Overdue
            </div>
          )}
          {contract.finalizedObligations > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 rounded text-xs font-medium">
              <Clock className="w-3 h-3" />
              {contract.finalizedObligations} Finalized
            </div>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t p-4 space-y-3">
          {loading && !loaded ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded" />
              <Skeleton className="h-16 w-full rounded" />
            </div>
          ) : (
            <>
              {/* Status tab filter */}
              <div className="flex items-center gap-2 flex-wrap">
                {STATUS_TABS.map(({ key, label, count }) => (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      statusFilter === key
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {label} ({count})
                  </button>
                ))}
              </div>

              {/* Obligations list */}
              {displayed.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  {categoryFilter !== "all"
                    ? `No ${categoryFilter} obligations for this contract.`
                    : `No ${statusFilter === "all" ? "" : statusFilter + " "}obligations for this contract.`}
                </p>
              ) : (
                <div className="space-y-3">
                  {displayed.map((ob) => (
                    <ObligationCard
                      key={ob.id}
                      obligation={ob}
                      onUpdateField={async (id, field, value) => {
                        try {
                          await fetch(`/api/obligations/${id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ [field]: value }),
                          });
                          refreshObligations();
                        } catch (err) {
                          console.error("Failed to update obligation:", err);
                        }
                      }}
                      onAddEvidence={(obId) => setEvidenceDialogObligationId(obId)}
                      onRemoveEvidence={async (obId, index) => {
                        try {
                          await fetch(`/api/obligations/${obId}/evidence/${index}`, {
                            method: "DELETE",
                          });
                          refreshObligations();
                        } catch (err) {
                          console.error("Failed to remove evidence:", err);
                        }
                      }}
                      onCheckCompliance={async (id) => {
                        try {
                          await fetch(`/api/obligations/${id}/check-compliance`, {
                            method: "POST",
                          });
                        } catch (err) {
                          console.error("Compliance check failed:", err);
                        }
                      }}
                      onFinalize={async (id, note) => {
                        try {
                          const res = await fetch(`/api/obligations/${id}/finalize`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ note }),
                          });
                          if (res.ok) {
                            toast.success("Obligation finalized");
                            refreshObligations();
                          } else {
                            const data = await res.json();
                            toast.error(data.error || "Failed to finalize");
                          }
                        } catch (err) {
                          toast.error(
                            `Finalize failed: ${err instanceof Error ? err.message : "Unknown error"}`
                          );
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          <EvidenceDialog
            obligationId={evidenceDialogObligationId}
            open={evidenceDialogObligationId !== null}
            onOpenChange={(open) => {
              if (!open) setEvidenceDialogObligationId(null);
            }}
            onEvidenceAdded={() => {
              refreshObligations();
              setEvidenceDialogObligationId(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

export function PerContractObligations({ contracts, categoryFilter }: PerContractObligationsProps) {
  if (contracts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">No contracts found.</p>
    );
  }

  return (
    <div className="space-y-3">
      {contracts.map((contract) => (
        <ContractObligationsRow
          key={contract.id}
          contract={contract}
          categoryFilter={categoryFilter}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Implement obligations-tab.tsx** (replace stub)

Replace `src/components/contracts/obligations-tab.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import type { Contract } from "@/lib/types";
import { OBLIGATION_CATEGORIES } from "@/lib/constants";
import { UpcomingObligationsSection } from "./upcoming-obligations-section";
import { PerContractObligations } from "./per-contract-obligations";
import { Skeleton } from "@/components/ui/skeleton";

export function ObligationsTab() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  useEffect(() => {
    async function loadContracts() {
      try {
        const res = await fetch("/api/contracts");
        if (res.ok) {
          const data = await res.json();
          setContracts(data.contracts || []);
        } else {
          toast.error("Failed to load contracts");
        }
      } catch (err) {
        toast.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
      } finally {
        setLoading(false);
      }
    }
    loadContracts();
  }, []);

  const categories = ["all", ...OBLIGATION_CATEGORIES] as const;

  return (
    <div className="space-y-10">
      {/* Top section: upcoming obligations grid */}
      <UpcomingObligationsSection />

      {/* Bottom section: per-contract breakdown */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Obligations by Contract</h3>
        </div>

        {/* Category filter — independent from upcoming section */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors capitalize ${
                categoryFilter === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : (
          <PerContractObligations contracts={contracts} categoryFilter={categoryFilter} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify final TypeScript build**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
npm run build 2>&1 | tail -30
```

Expected: build completes with no TypeScript errors.

If there are errors, check:
- `ObligationCard` prop signature matches what is passed from `ContractObligationsRow`
- `EvidenceDialog` prop types: `obligationId: number | null`, `open: boolean`, `onOpenChange: (open: boolean) => void`, `onEvidenceAdded: () => void`
- Run `grep -r "ObligationCard\|EvidenceDialog" src/components/obligations/ --include="*.tsx" | head -20` to inspect the actual prop interface

- [ ] **Step 4: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add src/components/contracts/per-contract-obligations.tsx src/components/contracts/obligations-tab.tsx
git commit -m "feat: add per-contract-obligations component and implement obligations tab"
```

---

## Final Verification Checklist

After all tasks are done, verify the following manually in the browser (`npm run dev`):

**Contracts tab:**
- [ ] Navigating to `/contracts` shows "Contracts" tab active by default
- [ ] Clicking "Obligations" tab updates URL to `?tab=obligations`
- [ ] Navigating to `/obligations` redirects to `/contracts?tab=obligations`
- [ ] Contract cards collapse correctly (name, status badge, expiry date, count badges; no action buttons visible)
- [ ] Expanding a card shows two-column layout: metadata on left, status strip + action buttons on right
- [ ] Status strip highlights the current status correctly for each contract
- [ ] Action buttons trigger confirmation dialogs where required (Terminate, Reactivate)
- [ ] Metadata fields are editable and save via PATCH
- [ ] Download link opens the contract file
- [ ] "Add New Contract" button opens dialog
- [ ] Dialog uploads file, processes, shows obligation count, auto-closes

**Obligations tab:**
- [ ] Upcoming obligations display as a card grid sorted by due date
- [ ] Category filter on upcoming section filters the grid independently
- [ ] Per-contract rows show name, status badge, obligation counts
- [ ] Expanding a contract row lazy-loads its obligations (loading skeleton visible briefly)
- [ ] Active/Inactive/Finalized/All tabs filter obligations by status
- [ ] Category filter above the breakdown section filters across all expanded rows
- [ ] The two category filters (upcoming vs. breakdown) do not affect each other
- [ ] Empty state messages show correctly when no obligations match
