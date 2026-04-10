# Task 1 — Implementation Plan

## Summary

Wrap the body of `handleBatchProcess` in `contracts-tab.tsx` with `try/finally` so that `setProcessingProgress(null)`, `clearSelection()`, and `refreshContracts()` always execute, even if an unexpected exception occurs mid-processing.

## File to modify

- `src/components/contracts/contracts-tab.tsx` (lines 176-210) — `handleBatchProcess` callback

## Detailed changes

The current `handleBatchProcess` function (lines 176-210) has cleanup calls at lines 201-203 that sit after the processing loop with no error protection. If any exception escapes — for example from `setProcessingProgress`, a toast call, or the translation function — those cleanup lines never run and the progress bar stays pinned.

### Change

Wrap lines 182-209 (everything after the early return and `setProcessingProgress` init) in a `try/finally`:

- **try block**: contains the loop (lines 185-198), the `succeeded`/`failed` counters, and the toast calls (lines 205-209)
- **finally block**: contains `setProcessingProgress(null)`, `clearSelection()`, `refreshContracts()`
- Remove those three cleanup calls from their current position (lines 201-203)

The initial `setProcessingProgress({ active: true, ... })` call on line 180 stays **before** the try block so the progress bar appears immediately. The counters (`succeeded`, `failed`) stay inside try since they are only needed for the toast messages which are also inside try.

### What stays the same

- The for-loop with per-item try/catch (lines 189-198) is unchanged
- The per-item `setProcessingProgress` update (line 187) is unchanged
- Toast messages (lines 205-209) remain inside the try block
- The early return guard (line 177) stays before everything
- No changes to `contract-bulk-action-bar.tsx` or any other file

## Risks

- Minimal. The change is purely structural — wrapping existing code in try/finally with no logic changes.
- Toast calls that previously ran unconditionally after the loop now run inside `try`. If a toast call itself throws, cleanup still runs (that is the whole point). The toast would be lost, but the UI would not be stuck.

## Success criteria verification

- Happy path: loop completes, toasts fire, cleanup runs in finally — same behavior as before
- Error path: if anything throws after the loop starts, finally still runs cleanup
- TypeScript: no type changes, `npx tsc --noEmit` will pass
- Build: no structural changes, `npx next build` will pass
