# Task 2 Plan -- i18n parse error display in chat panel

## Overview
Detect `parseError: true` in the structured answer API response and display a translated error message instead of rendering an empty `AnnotatedAnswer`. Add i18n keys to both English and Polish message files.

## Files to modify

### 1. `src/components/legal-hub/case-chat-panel.tsx`
- **Where:** `sendMessage` function, line 152, inside the `if (isStructuredAnswer(data))` branch
- **What:** Add inner branch: if `data.parseError === true`, append a plain assistant message with `t("chatParseError")` as content (no `structuredAnswer` property). Else, keep existing behavior.
- **Pattern:** follows existing message-append pattern using `setMessages([...newMessages, { role: "assistant", content: ... }])`
- **The `t` function** is already available at line 54: `const t = useTranslations('LegalHub')`

### 2. `messages/en.json`
- **Where:** Inside `LegalHub.chat` object (after line 199, before closing brace of `chat`)
- **What:** Add `"chatParseError": "I wasn't able to process the response. Please try again."`
- **Note:** The key is `chatParseError` at the `LegalHub` top level (not nested under `chat`), matching the plan README which uses `t("chatParseError")` not `t("chat.chatParseError")`. However, looking at the existing pattern, all chat-related keys are under `chat.*`. The README explicitly shows `t("chatParseError")` which means it should be at the LegalHub root level, not nested in chat. I will follow the README specification.

**Correction after re-reading:** The README shows the key added "inside the LegalHub object" at top level, and the TSX code uses `t("chatParseError")` -- so it goes at the LegalHub root level, not under `chat`.

### 3. `messages/pl.json`
- **Where:** Same position as en.json -- inside `LegalHub` object at top level
- **What:** Add `"chatParseError": "Nie udalo sie przetworzyc odpowiedzi. Sprubuj ponownie."`

## Exact changes

### case-chat-panel.tsx (lines 152-160)

Replace the `isStructuredAnswer(data)` branch:

```ts
// BEFORE:
if (isStructuredAnswer(data)) {
  setMessages([
    ...newMessages,
    {
      role: "assistant",
      content: data.answerText,
      structuredAnswer: data,
    },
  ]);
}

// AFTER:
if (isStructuredAnswer(data)) {
  if (data.parseError) {
    setMessages([
      ...newMessages,
      {
        role: "assistant",
        content: t("chatParseError"),
      },
    ]);
  } else {
    setMessages([
      ...newMessages,
      {
        role: "assistant",
        content: data.answerText,
        structuredAnswer: data,
      },
    ]);
  }
}
```

### en.json -- add at LegalHub top level (e.g., after "createdOn" line or before "tab" block)
```json
"chatParseError": "I wasn't able to process the response. Please try again.",
```

### pl.json -- same position
```json
"chatParseError": "Nie udalo sie przetworzyc odpowiedzi. Sprubuj ponownie.",
```

## Risks
- None significant. The change is additive -- only the `parseError` branch is new; the else branch is identical to existing code.
- TypeScript: `data.parseError` is valid because Task 1 added `parseError?: boolean` to `StructuredAnswer` in `lib/citation-assembler.d.ts`.

## Success criteria verification
- parseError true -> plain text message with translated string, no structuredAnswer property -> renders as `<p>` not `<AnnotatedAnswer>`
- parseError absent/false -> existing behavior preserved exactly
- Both locale files have the key
- tsc --noEmit passes
