# Task 2 Complete — Chat Route: Auto-Retry + Delta Fallback + var Fix

## Changes

- Modified: `src/app/api/legal-hub/cases/[id]/chat/route.ts`

### Change 1: `var genResponse` -> `let genResponse` (line 256)
- Added `let genResponse: Awaited<ReturnType<typeof anthropic.messages.create>>;` before the if/else block
- Both `var genResponse = await anthropic.messages.create(...)` replaced with `genResponse = await anthropic.messages.create(...)`

### Change 2: Delta vector search fallback (lines 264-277)
- Wrapped `_getVectorCandidates` call and deltaChunks filtering in try/catch
- On failure: logs error, sets `deltaChunks = []`, chat proceeds with priming context only
- Declared `let deltaChunks: RetrievalChunk[] = []` before the try block

### Change 3: Backend auto-retry wrapper (lines 232-245, 247, 505)
- Added `runWithRetry<T>` helper function (generic, 2 attempts, 500ms delay)
- Processing block (session cache check through response) wrapped in `runWithRetry(async () => { ... })`
- On first attempt failure: logs warning, calls `clearSessionContext(userId, caseIdStr)`, waits 500ms, retries
- On second attempt failure: throws to outer catch which returns `parseError: true`
- Auth, body parsing, case lookup, forceRefresh handling remain OUTSIDE the retry wrapper (lines 167-230)

## Verification
- `tsc --noEmit` passes with zero errors
- No other files modified
- `clearSessionContext` was already imported (line 26)
