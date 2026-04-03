# Task 2 Plan — History Payload Slimming

## Audit Findings

After thorough code audit, **the problem described in the plan does not exist in the current codebase.** The history payload is already slim.

### Evidence

In `src/components/legal-hub/case-chat-panel.tsx`:

1. **ChatMessage interface** (line 18-24): `content` is typed as `string`. The full `StructuredAnswer` is stored in a separate `structuredAnswer` property.

2. **Assistant message creation** (line 164-171): When a structured answer is received, the message is created as:
   ```typescript
   { role: "assistant", content: data.answerText, structuredAnswer: data }
   ```
   The `content` field gets only the plain `answerText` string.

3. **History construction** (lines 126-131): The history is built by mapping only `role` and `content`:
   ```typescript
   const history = previousMessages
     .filter((m) => !m.actionProposal)
     .map((m) => ({ role: m.role, content: m.content }));
   ```
   The `structuredAnswer` property (which holds citations, annotations, usedDocuments) is never included.

4. **All other assistant content paths** also set `content` to plain strings:
   - Parse error: `content: t("chatParseError")`
   - Fallback: `content: data.answer || data.answerText || ""`
   - Action proposals: filtered out by `!m.actionProposal`

### Conclusion

The first three success criteria are already met:
- Assistant entries in history contain only `answerText` string -- **ALREADY TRUE**
- User-visible display is unchanged -- **ALREADY TRUE** (display uses `structuredAnswer` prop, not `content`)
- `tsc --noEmit` passes -- **ALREADY TRUE**

The fourth criterion ("measurably smaller than before") **cannot be achieved** because there is no bloat to remove.

## Recommendation

This task requires no code changes. The plan's assumption that "the frontend currently echoes full StructuredAnswer JSON" is incorrect based on the current code.

### Optional Hardening (if Lead approves)

If desired, I can add a defensive server-side guard in `route.ts` that strips any accidental JSON from assistant history content. This would be a belt-and-suspenders safeguard but is not strictly necessary.

## Files to modify

None required. The code already satisfies the task's success criteria.
