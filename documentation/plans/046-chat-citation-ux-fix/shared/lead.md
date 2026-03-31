# Plan 046 — Lead Notes

## Plan Overview
Fix 5 user-reported issues in Legal Hub case chat: citation density, missing sources footer, hover card scrollbar, broken history after action proposals, and silent parse error failures.

## Concurrency Decision
4 tasks, all independent (no dependencies). Running up to 3 concurrent task-teams. Tasks 1+2+3 start simultaneously; Task 4 fills slot when first finishes.

## Task Dependency Graph
- Task 1: no dependencies
- Task 2: no dependencies
- Task 3: no dependencies
- Task 4: no dependencies

## Key Architectural Constraints
- citation-assembler.js is a CommonJS module in lib/ — NOT a TypeScript file
- StructuredAnswer type is defined in TWO places: lib/citation-assembler.d.ts AND src/components/legal-hub/annotated-answer.tsx — keep in sync
- i18n keys for chat are nested: LegalHub.chat.{key} in messages/en.json and messages/pl.json
- chatParseError is a flat key: LegalHub.chatParseError (not nested under chat)
- prompts/case-chat-grounded.md is read at runtime by the route — changes take effect immediately
- The history filtering fix must NOT break the existing action-proposal flow (propose → confirm → apply)

## Critical Files
- prompts/case-chat-grounded.md — system prompt (task 1)
- src/components/legal-hub/case-chat-panel.tsx — chat UI (tasks 2, 4)
- src/components/legal-hub/citation-hover-card.tsx — hover card (task 3)
- lib/citation-assembler.js — citation parser (task 4 logging)
- src/app/api/legal-hub/cases/[id]/chat/route.ts — API route (task 4 logging)
- messages/en.json, messages/pl.json — i18n (task 2)

## Tests
- tests/unit/citation-assembler.test.ts — must pass after task 1 and 4

## Decisions Made During Execution
- chat/route.ts already had console.error in catch block — Change C reduced to wording improvement only
- Reviewer/tester early-exit pattern: background agents exited after context-read phase; Lead verified all implementations directly via file reads + test runs
- History filter removes actionProposal assistant turns only; user turns are plain strings (not tool_result blocks), so no paired removal needed

## Execution Complete

**Plan:** 046-chat-citation-ux-fix
**Tasks:** 4 completed, 0 skipped, 0 escalated

### Tasks Completed
- task-1: Added citation selectivity constraint to prompts/case-chat-grounded.md (max 3-5 markers, key claims only, BEZWZGLĘDNIE NIE for DANE SPRAWY fields)
- task-2: Added usedDocuments sources footer to case-chat-panel.tsx; i18n keys LegalHub.chat.sources in en.json + pl.json
- task-3: Removed max-h-[400px] overflow-y-auto wrapper div from citation-hover-card.tsx
- task-4: Added .filter((m) => !m.actionProposal) to history in case-chat-panel.tsx; added console.error logging in lib/citation-assembler.js parseCitationResponse catch block

### Files Modified
- `prompts/case-chat-grounded.md` — citation selectivity rules
- `src/components/legal-hub/case-chat-panel.tsx` — sources footer + history filter
- `src/components/legal-hub/citation-hover-card.tsx` — scrollbar wrapper removed
- `messages/en.json` — sources key added
- `messages/pl.json` — sources key added
- `lib/citation-assembler.js` — parse error logging

### Test Results
- Per-task tests (citation-assembler): 22/22 passed
- Final gate (full suite): 890/891 — 1 pre-existing failure in court-fee.test.ts (unrelated, known since Plan 042)
- TypeScript: clean (no errors)

### Follow-up Items
- Parse error logging will surface raw Claude output in Railway logs — monitor for patterns to inform further prompt hardening
- If hover card content still overflows viewport edge after Task 1 citation reduction, consider adding max-h: var(--radix-hover-card-content-available-height) to HoverCard.Content
