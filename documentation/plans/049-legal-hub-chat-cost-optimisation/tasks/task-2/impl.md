# Task 2 Implementation Notes — History Payload Slimming

## Outcome: Closed as already-complete — no code changes

### Audit Summary

The plan assumed the frontend echoed full `StructuredAnswer` JSON (including `citations[]`, `annotations[]`, `usedDocuments[]`) in the history array. Code audit proved this is not the case.

**`src/components/legal-hub/case-chat-panel.tsx`:**
- `ChatMessage.content` is always set to `data.answerText` (plain string) for structured answers (line 168)
- The full `StructuredAnswer` is stored in a separate `structuredAnswer` property used only for display rendering
- History construction (lines 126-131) maps only `m.role` and `m.content` — never includes `structuredAnswer`
- Action proposal messages are filtered out entirely

**`src/app/api/legal-hub/cases/[id]/chat/route.ts`:**
- Server receives `history` typed as `Array<{ role: string; content: string }>` (line 204-207)
- Maps history entries directly to Anthropic message format (lines 252-257)

### Success Criteria Status

| Criterion | Status |
|-----------|--------|
| Assistant entries in history contain only answerText string | Already true |
| User-visible display unchanged | Already true |
| `tsc --noEmit` passes | Already true |
| History-heavy turn measurably smaller | N/A — no bloat to remove |

### Files Modified

None.
