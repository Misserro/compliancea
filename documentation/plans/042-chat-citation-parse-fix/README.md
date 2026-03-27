# Plan 042 — Chat Citation Parse Fix

## Goal

Fix intermittent chat failures in Legal Hub case chat where raw JSON appears instead of a rendered answer, and citation hover/underline affordances don't appear.

---

## Background

The case chat pipeline always routes Claude's text response through `parseCitationResponse()` in `lib/citation-assembler.js`. This function expects a bare JSON object from Claude, but Claude occasionally adds a preamble before the JSON (e.g. a sentence of explanation) despite the system prompt instructing "ONLY JSON, no preamble."

When a preamble is present, the code fence stripping regex (`/^```json\s*/i` anchored at string start) fails to match, `JSON.parse` throws, and the degraded fallback fires:

```js
const degraded = {
  answerText: rawText,   // THE ENTIRE RAW RESPONSE — includes the JSON Claude produced
  annotations: [],
  citations: [],
  ...
};
```

The degraded object passes `isStructuredAnswer()` in `case-chat-panel.tsx` (it has `answerText`, `annotations[]`, `citations[]`), so `AnnotatedAnswer` renders it — but `answerText` is the raw Claude output. The user sees `{"answerText": "...", "citations": {...}}` as visible text. No citation underlines, no hover cards.

**Intermittent**: Claude follows the strict JSON instruction most of the time; failures occur on longer or more complex queries when Claude is more likely to add context before the JSON.

---

## Architecture

- `lib/citation-assembler.js` — `parseCitationResponse` is the parse failure point; fix here is pure JS, no side effects
- `lib/citation-assembler.d.ts` — type declarations; add `parseError?: boolean` to `StructuredAnswer`
- `prompts/case-chat-grounded.md` — system prompt; add one hardening line to reduce preamble frequency
- `src/components/legal-hub/case-chat-panel.tsx` — React client; detect `parseError: true` and render translated error message
- `messages/en.json` / `messages/pl.json` — i18n keys for the parse error message

The `chat/route.ts` does **not** need changes — it already does `NextResponse.json(structured)`, so the `parseError` flag flows through automatically.

---

## Tasks

- [ ] **Task 1 — Robust JSON extraction + prompt hardening**
- [ ] **Task 2 — i18n parse error display in chat panel** *(depends on Task 1)*

Task 2 can pipeline-spawn during Task 1 review/test phase.

---

## Task 1 — Robust JSON extraction + prompt hardening

**Description:**
Fix `parseCitationResponse` to extract JSON robustly regardless of any preamble or code fence format Claude uses. Add `parseError` flag to the degraded fallback so downstream can detect failure. Harden the system prompt.

**Files:**
- `lib/citation-assembler.js`
- `lib/citation-assembler.d.ts`
- `prompts/case-chat-grounded.md`

**Changes:**

`lib/citation-assembler.js` — replace the fragile code fence stripping (lines 69-73):

```js
// BEFORE (fragile):
const cleaned = rawText
  .replace(/^```json\s*/i, "")
  .replace(/^```\s*/i, "")
  .replace(/\s*```$/i, "")
  .trim();

// AFTER (robust):
// Extract the first complete JSON object: find first '{' and last '}'
const firstBrace = rawText.indexOf("{");
const lastBrace = rawText.lastIndexOf("}");
const cleaned =
  firstBrace >= 0 && lastBrace > firstBrace
    ? rawText.substring(firstBrace, lastBrace + 1)
    : rawText.trim();
```

Also update the degraded fallback to:
1. Set `answerText: ""` (empty string — never show raw Claude output)
2. Add `parseError: true`

```js
const degraded = {
  answerText: "",
  annotations: [],
  citations: [],
  usedDocuments: [],
  confidence: "low",
  needsDisambiguation: false,
  parseError: true,
};
```

`lib/citation-assembler.d.ts` — add `parseError?: boolean` to `StructuredAnswer` type interface.

`prompts/case-chat-grounded.md` — add after the existing "TYLKO JSON" line:

```
Jeśli napiszesz cokolwiek przed '{' lub po '}', odpowiedź zostanie odrzucona.
```

**Patterns:**
- `lib/citation-assembler.js` — read to understand current `parseCitationResponse` implementation
- `lib/citation-assembler.d.ts` — read to find `StructuredAnswer` interface definition
- `prompts/case-chat-grounded.md` — read to find exact insertion point

**Success criteria:**
- Claude response with preamble text before JSON parses successfully (JSON is extracted from `{` to `}`)
- Claude response as bare JSON (no preamble) still parses correctly
- Code-fenced JSON response (` ```json\n{...}\n``` `) still parses correctly
- Degraded fallback has `answerText: ""` and `parseError: true` (not raw Claude text)
- `prompts/case-chat-grounded.md` contains the new hardening line
- TypeScript compilation clean (no errors in `lib/citation-assembler.d.ts`)

---

## Task 2 — i18n parse error display in chat panel

**Description:**
In `case-chat-panel.tsx`, detect `parseError: true` in the API response and display a translated error message using `useTranslations` instead of passing the empty `StructuredAnswer` to `AnnotatedAnswer`.

**Files:**
- `src/components/legal-hub/case-chat-panel.tsx`
- `messages/en.json`
- `messages/pl.json`

**Changes:**

`case-chat-panel.tsx` — in `sendMessage`, after checking `isStructuredAnswer(data)`, add a branch for `parseError`:

```ts
if (isStructuredAnswer(data)) {
  if (data.parseError) {
    // Show translated error message as a plain assistant message
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: t("chatParseError"),
      },
    ]);
  } else {
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: data.answerText,
        structuredAnswer: data,
      },
    ]);
  }
}
```

`messages/en.json` — add inside the `LegalHub` object:
```json
"chatParseError": "I wasn't able to process the response. Please try again."
```

`messages/pl.json` — add inside the `LegalHub` object:
```json
"chatParseError": "Nie udało się przetworzyć odpowiedzi. Spróbuj ponownie."
```

**Patterns:**
- `src/components/legal-hub/case-chat-panel.tsx` — read `sendMessage` handler to find exact insertion point and existing message-append pattern
- `messages/en.json` and `messages/pl.json` — read to find `LegalHub` object and existing insertion pattern

**Success criteria:**
- When API returns `parseError: true`, chat panel shows a plain text message in the current app language (Polish or English based on i18n setting)
- The message text uses the `LegalHub.chatParseError` translation key
- No empty `AnnotatedAnswer` component is rendered for parse errors
- Normal successful responses are unaffected
- Both `en.json` and `pl.json` contain `LegalHub.chatParseError`
- TypeScript compilation clean
