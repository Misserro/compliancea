# Task 4 — History fix + parse error logging — Implementation Plan

## Overview
Three small, targeted changes: (A) filter action-proposal messages from conversation history before sending to API, (B) add console.error logging in citation-assembler's JSON parse catch, (C) improve route catch block logging message.

## Files to Modify

### A — `src/components/legal-hub/case-chat-panel.tsx` (line ~126)
- Add `.filter((m) => !m.actionProposal)` before `.map()` in the `sendMessage` function
- This excludes action-proposal assistant turns (which contain tool_use blocks that cannot be serialized as plain strings) from the history sent to the API
- The action-proposal flow itself (propose, confirm, apply) is unaffected because it does not depend on history — it uses the `actionProposal` object stored in the message state

### B — `lib/citation-assembler.js` (line ~78)
- Change bare `catch {` to `catch (e) {`
- Add `console.error('[citation-assembler] JSON parse failed:', e.message, '| raw (first 500):', rawText.substring(0, 500));` before `return degraded`

### C — `src/app/api/legal-hub/cases/[id]/chat/route.ts` (line ~326)
- Current: `console.error("[chat/route] Error:", err);`
- Change to: `console.error("[chat/route] Unhandled error:", err);`
- This is a minor wording change to clarify the error is unhandled/unexpected

## Success Criteria Verification
1. History fix: action-proposal messages excluded from `history` array — next question retains Q&A context
2. Parse error logging: server log shows raw Claude output (first 500 chars) and error message on JSON parse failure
3. Route catch logging: server log shows actual error object on unhandled errors
4. No regression: action-proposal flow unaffected (filter only removes from history, not from message state)
5. `tests/unit/citation-assembler.test.ts` passes

## Risks
- None significant. All changes are additive (filter, logging) with no structural refactoring.
