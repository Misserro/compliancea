# Lead Notes — Plan 042-chat-citation-parse-fix

## Plan Overview
Fix intermittent case chat failures where raw JSON appears instead of rendered answer and citation hover/underline affordances don't work.

Root cause: `parseCitationResponse` code fence stripping (`/^```json\s*/i`) anchored at string start. Any Claude preamble before JSON causes JSON.parse to throw. Degraded fallback sets `answerText: rawText` (entire raw response including JSON structure), which renders as visible text. `isStructuredAnswer()` passes (empty annotations/citations arrays), so `AnnotatedAnswer` renders it — with no citation spans.

## Concurrency Decision
2 tasks. Max 2 concurrent. Task 2 depends on Task 1 — pipeline-spawn during Task 1 review/test phase.

## Task Dependency Graph
- Task 1: no dependencies
- Task 2: depends on Task 1

## Key Architectural Constraints
- `lib/citation-assembler.js` is pre-compiled CJS — edit source directly (no build step needed for runtime)
- `lib/citation-assembler.d.ts` must be kept in sync with the JS source
- The `parseCitationResponse` degraded fallback currently sets `answerText: rawText` — changing to `answerText: ""` + `parseError: true` is the safe approach (empty string passes `isStructuredAnswer()` type guard)
- `chat/route.ts` does NOT need changes — it already does `NextResponse.json(structured)`, so `parseError` flows through automatically
- i18n in client layer only — `lib/` files are pure Node.js with no access to next-intl
- `case-chat-panel.tsx` uses `useTranslations('LegalHub')` — new key `chatParseError` goes in the `LegalHub` namespace
- JSON extraction strategy: `rawText.substring(firstBrace, lastBrace + 1)` handles all Claude output variants

## Critical Decisions
- Use `{…}` bracket extraction (first `{` to last `}`) rather than improved regex — handles all output variants robustly
- Degraded `answerText: ""` not a user-visible string — i18n message comes from client via `parseError: true` flag
- Pipeline-spawn Task 2 during Task 1 review/test phase so it can plan ahead

---

## Execution Complete

**Plan:** 042-chat-citation-parse-fix
**Tasks:** 2 completed, 0 skipped, 0 escalated

### Tasks Completed
- Task 1: Fixed `parseCitationResponse` — `{…}` bracket extraction, degraded fallback `answerText: ""` + `parseError: true`, prompt hardening line in `case-chat-grounded.md`
- Task 2: Added `parseError` detection branch in `case-chat-panel.tsx`, `LegalHub.chatParseError` i18n keys in both message files; also added `parseError?: boolean` to `StructuredAnswer` in `annotated-answer.tsx` (discovered that file owns the client-side type, not `lib/citation-assembler.d.ts`)

### Files Modified
- `lib/citation-assembler.js` — robust JSON extraction + degraded fallback fix
- `lib/citation-assembler.d.ts` — `parseError?: boolean` added to `StructuredAnswer`
- `prompts/case-chat-grounded.md` — hardening line added at line 57
- `src/components/legal-hub/annotated-answer.tsx` — `parseError?: boolean` added to local `StructuredAnswer`
- `src/components/legal-hub/case-chat-panel.tsx` — `parseError` branch in `sendMessage`
- `messages/en.json` — `LegalHub.chatParseError` added
- `messages/pl.json` — `LegalHub.chatParseError` added
- `tests/unit/citation-assembler.test.ts` — stale assertion updated + 2 new tests for preamble parsing and degraded fallback

### Test Results
- Per-task tests: 2/2 PASS
- Final gate (full suite): PASSED — 890/891, 1 pre-existing unrelated failure (`court-fee.test.ts`), TypeScript clean

### Key Discovery During Execution
`case-chat-panel.tsx` imports `StructuredAnswer` from `annotated-answer.tsx`, not from `lib/citation-assembler.d.ts`. Task 2 executor correctly identified this and added `parseError?: boolean` to the right file.
