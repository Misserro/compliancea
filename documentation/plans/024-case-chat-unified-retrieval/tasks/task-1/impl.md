# Task 1 — Implementation Notes

## Files Changed

### 1. `lib/citation-assembler.js`
- Added 5 patterns to `isHighRiskQuery`: `/summarise/i`, `/summary/i`, `/overview/i`, `/streszcz/i`, `/streszczenie/i`
- Existing patterns (`/summarize/i`, `/podsumuj/i`, `/podsumowanie/i`) left unchanged

### 2. `prompts/case-chat-grounded.md`
- Replaced entire content with dual-context prompt
- New prompt handles `[DANE SPRAWY]` (structured DB data) and `[DOKUMENTY SPRAWY]` (document evidence)
- Source priority: structured data for registration facts, documents for case merits
- When no documents indexed: answer from structured data only, state the gap
- Citation rules: `[cit:chunkId]` only for document evidence, never for structured data
- Language: Polish default, match user language

### 3. `src/app/api/legal-hub/cases/[id]/chat/route.ts`

**Removed:**
- `CLASSIFIER_SYSTEM` constant
- `Intent` and `ClassifierResult` types
- Haiku classifier API call (eliminates ~400ms latency)
- All intent routing branches (`case_info`, `party_lookup`, `deadline_query`, `unknown`)
- `respondWithSimpleContext` function
- Early return when no retrieval results (now answers from structured data instead)

**Added:**
- `buildStructuredContext(legalCase, parties, deadlines)` — combines existing format helpers under `=== DANE SPRAWY ===` header
- Unified flow: sync DB fetch → async document retrieval → combined user message → single Claude call
- `formatDeadlinesContext` now filters out completed deadlines, sorts by `due_date`, limits to top 5

**Fixed:**
- max_tokens truncation: returns clean Polish fallback message instead of raw partial JSON
- No-documents case: sets `confidence = "low"` but still answers from structured context

## Verification

- TypeScript: compiles clean (`npx tsc --noEmit` — no errors)
- Tests: 65/65 passed (`npm test`)
