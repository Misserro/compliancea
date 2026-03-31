## Task 4 Complete — History fix + parse error logging

### Changes

- **Modified:** `src/components/legal-hub/case-chat-panel.tsx` (line 127) — added `.filter((m) => !m.actionProposal)` before `.map()` in the `sendMessage` function's history serialization. This excludes action-proposal assistant turns from the history array sent to the API, preventing malformed tool_use content from breaking Anthropic's multi-turn contract.

- **Modified:** `lib/citation-assembler.js` (line 78-79) — changed bare `catch {}` to `catch (e) {}` and added `console.error('[citation-assembler] JSON parse failed:', e.message, '| raw (first 500):', rawText.substring(0, 500))` before `return degraded`. Server logs now show the error message and first 500 characters of raw Claude output when JSON parsing fails.

- **Modified:** `src/app/api/legal-hub/cases/[id]/chat/route.ts` (line 326) — changed log prefix from `"[chat/route] Error:"` to `"[chat/route] Unhandled error:"` for clarity.

### Verification
- `tests/unit/citation-assembler.test.ts`: 22/22 passed
- `npx tsc --noEmit`: clean, no errors

### Notes
- The history filter is intentionally broad: any message with a truthy `actionProposal` field is excluded. This covers both the assistant's proposal turn and preserves all normal Q&A turns.
- The action-proposal flow (propose -> confirm -> apply) is unaffected because it operates on the `actionProposal` object stored in message state, not on the serialized history.
- INTEGRATION: No other tasks depend on these changes. No exports added or modified.
