# Task 2 Plan -- Processing progress bar for documents library tab

## Summary

Extract the inline progress bar UI from `ContractBulkActionBar` into a shared `ProcessingProgressBar` component, wire it into the documents library page with sequential processing and per-item progress tracking, and update the action bar to disable during processing.

## Files to create/modify

### 1. CREATE `src/components/ui/processing-progress-bar.tsx`

New shared component. Exports:
- `ProcessingProgress` interface (moved here as the canonical location, re-exported from contracts-tab.tsx if needed)
- `ProcessingProgressBar` component

Props: `{ processingProgress: ProcessingProgress | null }`

Renders the exact same JSX currently in `contract-bulk-action-bar.tsx` lines 61-75 (the progress mode branch), wrapped in the same `fixed bottom-0` container with `translate-y` animation. The component is self-contained: it computes `isVisible` from `processingProgress?.active`, computes `progressPercent`, and renders the label/percentage/Progress bar.

Translation key: Uses a generic `processingProgress` key. Since the contracts tab uses `Contracts.processingProgress` and we need the documents page to work too, the component will accept an optional `label` string prop OR we use the `useTranslations` with a `namespace` prop. Simpler approach: accept a pre-formatted `label` string as an alternative prop OR accept a `translationNamespace` prop.

**Decision:** The simplest approach that matches existing patterns is to accept a pre-formatted `label` string prop. The parent component (contracts tab or documents library) computes the label using its own `useTranslations` namespace and passes it in. This avoids the shared component needing to know about translation namespaces.

Updated props:
```ts
export interface ProcessingProgress {
  active: boolean;
  current: number;
  total: number;
  currentName: string;
}

interface ProcessingProgressBarProps {
  processingProgress: ProcessingProgress | null;
  label?: string; // pre-formatted label, e.g. "Processing 3/10 -- Contract Name"
}
```

If `label` is not provided, fall back to a generic `"Processing {current}/{total} -- {name}"` format (no i18n, just a default).

**Actually, simpler:** The component can just format `Processing {current}/{total} -- {name}` itself using the `processingProgress` fields directly. Both pages will show the same format. The contracts tab currently uses `t("processingProgress", { current, total, name })` which produces `"Processing 3/10 -- Contract Name"`. The documents page will show the same format. We can just hardcode the format in the shared component or let each parent pass a label.

**Final decision:** Keep it simple. The shared component takes `processingProgress` and renders `"Processing {current}/{total} -- {name}"`. We add a `Documents.processingProgress` translation key to both en.json and pl.json matching the Contracts namespace pattern. The component will accept a `namespace` or we just pass the formatted label from the parent.

Actually the cleanest approach: the component accepts the full `processingProgress` object and a `label` string. The parent is responsible for formatting the label using its own translations. This keeps the shared component translation-agnostic.

```tsx
interface ProcessingProgressBarProps {
  processingProgress: ProcessingProgress | null;
  label: string; // parent formats this with its own t() call
}
```

### 2. UPDATE `src/components/contracts/contract-bulk-action-bar.tsx`

- Remove the `ProcessingProgress` interface (import from `processing-progress-bar.tsx`)
- Import `ProcessingProgressBar` from `@/components/ui/processing-progress-bar`
- Replace the progress mode branch (lines 61-75) with `<ProcessingProgressBar processingProgress={processingProgress} label={t("processingProgress", { current: ..., total: ..., name: ... })} />`
- Wait -- the `ProcessingProgressBar` wraps itself in the `fixed bottom-0` container. But in `ContractBulkActionBar`, the progress bar is INSIDE the existing `fixed bottom-0` container (the bulk action bar itself). So we have two options:
  1. The shared component renders only the inner content (label + progress bar), and each parent wraps it in their own container
  2. The shared component renders the full fixed-bottom container

Looking at the plan README: "Same `fixed bottom-0 ... translate-y` animation as the current bar". And on the documents library page, there is no existing bulk action bar -- the progress bar needs its own container. So the shared component should include the full fixed-bottom container.

For `ContractBulkActionBar`: when in progress mode, we can hide the bulk action bar itself and let `ProcessingProgressBar` render its own fixed container. OR we replace only the inner content.

**Looking at the current code more carefully:**

`ContractBulkActionBar` has ONE outer `div` with `fixed bottom-0` that toggles between progress mode (lines 61-75) and action mode (lines 77-116). The `isVisible` condition covers both modes.

If we extract the progress bar into a shared component with its own `fixed bottom-0` wrapper, then on the contracts page we'd have TWO fixed-bottom elements when processing: the `ContractBulkActionBar` (which would show nothing in progress mode) and the `ProcessingProgressBar`.

**Better approach:** The shared component renders ONLY the inner progress content (the `space-y-3` div with label + Progress bar). It does NOT include the fixed-bottom container. Each consumer wraps it as needed:
- `ContractBulkActionBar` uses it inside its existing fixed-bottom container (replacing the inline progress JSX)
- Documents library page mounts it inside its own fixed-bottom container

Wait, but the README says: "Same fixed bottom-0 ... translate-y animation". Let me re-read...

The README says for the shared component: "isVisible logic: show only when processingProgress?.active === true", "Same fixed bottom-0 ... translate-y animation as the current bar".

So the shared component DOES include the fixed container + animation. For `ContractBulkActionBar`, when `isProcessing` is true, we would NOT render the progress inside the bulk action bar. Instead, the separate `ProcessingProgressBar` component (mounted alongside `ContractBulkActionBar` in `contracts-tab.tsx`) would show.

But wait -- the current `ContractBulkActionBar` already handles showing/hiding based on `isVisible = selectedCount > 0 || processingProgress?.active`. If we remove the progress rendering from `ContractBulkActionBar`, then when processing is active and no items are selected, the bulk action bar hides (since we'd remove the `processingProgress?.active` from isVisible), and the separate `ProcessingProgressBar` shows.

**This is getting complex. Let me simplify based on what the README actually says:**

README Step 2: "Import and use `<ProcessingProgressBar processingProgress={processingProgress} />` in the progress mode branch (replacing the inline progress JSX). Keep all other existing behavior unchanged."

So the `ProcessingProgressBar` is used INSIDE the `ContractBulkActionBar`, replacing the inline progress JSX (lines 63-75). It does NOT have its own fixed container. The inner content is extracted.

But then for documents library, Step 1 says "Same fixed bottom-0 ... translate-y animation". So on the documents page, we need a wrapper.

**Resolution:** The shared component renders the inner content only (label + percentage + Progress bar). On documents library page, we wrap it in the same fixed-bottom container. On contracts page, it slots into the existing `ContractBulkActionBar` container.

Actually wait, let me re-read the README more carefully:

> Step 1: "isVisible logic: show only when processingProgress?.active === true" and "Same fixed bottom-0 ... translate-y animation as the current bar"

This suggests the shared component IS self-contained with its own fixed container. Then in Step 2 for ContractBulkActionBar: "Import and use <ProcessingProgressBar /> in the progress mode branch (replacing the inline progress JSX)."

If the shared component has its own fixed container, placing it inside the already-fixed `ContractBulkActionBar` would cause nested fixed elements. That's wrong.

**Final resolution:** The shared component includes the fixed-bottom container + animation. For `ContractBulkActionBar`, instead of rendering it INSIDE the action bar, we render it ALONGSIDE. In `contracts-tab.tsx`, we mount `<ProcessingProgressBar>` next to `<ContractBulkActionBar>`. The `ContractBulkActionBar` itself only shows when NOT processing (the action mode). This keeps both components clean.

But the README says to update `ContractBulkActionBar` to use the shared component... Let me just follow the simplest interpretation that works:

**The shared component includes the full fixed-bottom container.** In `contract-bulk-action-bar.tsx`, when `isProcessing` is true, render `<ProcessingProgressBar />` instead of the entire container. When not processing, render the normal action bar. This way there's only one fixed-bottom element at a time.

### Revised plan for `contract-bulk-action-bar.tsx`:

```tsx
if (isProcessing && processingProgress) {
  return <ProcessingProgressBar processingProgress={processingProgress} label={...} />;
}

// Otherwise return the normal action bar JSX
return (
  <div className={`fixed bottom-0 ...`}>
    ...action mode only...
  </div>
);
```

This removes the ternary inside the container and instead does an early return. Clean.

### 3. UPDATE `src/app/(app)/documents/library/page.tsx`

1. Import `ProcessingProgress` from `@/components/ui/processing-progress-bar`
2. Import `ProcessingProgressBar` from `@/components/ui/processing-progress-bar`
3. Add state: `const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null)`
4. Rewrite `handleProcessAll`:
   - Keep the early return for `unprocessed.length === 0`
   - Set `processingProgress({ active: true, current: 0, total: unprocessed.length, currentName: "" })`
   - Sequential for-loop (same pattern as `handleBatchProcess` in contracts-tab.tsx)
   - Update `processingProgress` per item with `current: i + 1` and `currentName: doc.name`
   - `try/finally` wrapping the loop to always reset `setProcessingProgress(null)` and call `loadDocuments()`
   - Keep existing toast logic for succeeded/failed counts
5. Pass `processingProgress` to `<ActionBar />`
6. Mount `<ProcessingProgressBar processingProgress={processingProgress} label={...} />` at the bottom of the page JSX (after `ContractActionDialog`)

### 4. UPDATE `src/components/documents/action-bar.tsx`

1. Import `ProcessingProgress` type from `@/components/ui/processing-progress-bar`
2. Add `processingProgress?: ProcessingProgress | null` to `ActionBarProps`
3. Disable the dropdown trigger (and all items) when `processingProgress?.active` -- this is IN ADDITION to the existing `loading !== null` check. New condition: `loading !== null || processingProgress?.active`

### 5. ADD translation keys

Add `Documents.processingProgress` to both `messages/en.json` and `messages/pl.json`:
- en: `"processingProgress": "Processing {current}/{total} \u2014 {name}"`
- pl: `"processingProgress": "Przetwarzanie {current}/{total} \u2014 {name}"`

## Success criteria mapping

| Criterion | How satisfied |
|-----------|--------------|
| Progress bar appears at bottom during bulk processing | `ProcessingProgressBar` mounted in documents library page with fixed-bottom container |
| Bar shows current/total and document name | Sequential loop updates `processingProgress` per item; label formatted with translation |
| Bar disappears after processing | `try/finally` resets `processingProgress` to `null` |
| No regression on contracts tab | `ContractBulkActionBar` uses same shared component, same behavior |
| TypeScript clean | All types imported, interfaces consistent |
| Existing toasts still work | Toast logic preserved in rewritten `handleProcessAll` |
| Button disable state works on both pages | `ActionBar` disables when `processingProgress?.active`, `ContractBulkActionBar` unchanged |

## Risks

- Translation key addition: need to add to both en.json and pl.json. Low risk.
- The `ContractBulkActionBar` refactor changes rendering logic from ternary to early return. Low risk, same visual outcome.
- The `isVisible` logic in `ContractBulkActionBar` changes slightly since we early-return for processing mode, but the bar still shows/hides correctly because `ProcessingProgressBar` handles its own visibility.
