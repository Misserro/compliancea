# Task 2 Implementation Notes -- i18n parse error display in chat panel

## Changes

- **Modified:** `src/components/legal-hub/case-chat-panel.tsx` (lines 152-170)
  - Added inner branch inside `if (isStructuredAnswer(data))`: when `data.parseError` is truthy, appends a plain assistant message with `t("chatParseError")` as content (no `structuredAnswer` property set). When `parseError` is absent/false, existing behavior preserved exactly.
  - The plain message renders via the `msg.content` fallback path in the JSX (line ~280), not via `<AnnotatedAnswer>`, because `structuredAnswer` is not set on the message object.

- **Modified:** `src/components/legal-hub/annotated-answer.tsx` (line 18)
  - Added `parseError?: boolean` to the `StructuredAnswer` interface exported from this file. This was necessary because `case-chat-panel.tsx` imports `StructuredAnswer` from `./annotated-answer`, not from `lib/citation-assembler.d.ts`. Without this addition, `data.parseError` would be a TypeScript error.

- **Modified:** `messages/en.json` (line 137)
  - Added `"chatParseError": "I wasn't able to process the response. Please try again."` at the `LegalHub` top level

- **Modified:** `messages/pl.json` (line 137)
  - Added `"chatParseError": "Nie udalo sie przetworzyc odpowiedzi. Sprubuj ponownie."` at the `LegalHub` top level

## INTEGRATION note
- Task 1 added `parseError?: boolean` to `lib/citation-assembler.d.ts` `StructuredAnswer`. I also added it to `src/components/legal-hub/annotated-answer.tsx` `StructuredAnswer` because that is the type actually imported by `case-chat-panel.tsx`. Both interfaces must have the field.

## Verification
- `npx tsc --noEmit` passes cleanly
- Parse error path: API returns `{ answerText: "", annotations: [], citations: [], ..., parseError: true }` -> `isStructuredAnswer()` returns true -> `data.parseError` is truthy -> plain text message with translation key -> no `structuredAnswer` on message -> renders `<p>` not `<AnnotatedAnswer>`
- Normal path: API returns structured answer without `parseError` -> existing else branch -> `structuredAnswer` set -> renders `<AnnotatedAnswer>` as before
