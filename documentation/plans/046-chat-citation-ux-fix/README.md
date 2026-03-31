# Plan 046 — Chat Citation UX Fix

## Status
- [ ] Task 1 — Citation density: prompt tuning
- [ ] Task 2 — Sources footer + limitedEvidence UI rework
- [ ] Task 3 — Hover card scrollbar fix
- [ ] Task 4 — History fix + parse error logging

## Background

The Legal Hub case chat has five user-reported issues after Plans 042–045:

1. **Over-citation** — almost all text is underlined because the system prompt instructs Claude to cite every document-sourced sentence with no selectivity constraint.
2. **History broken** — after any action-proposal turn (tool_use), subsequent messages lose context because the history is serialized as plain strings, omitting required `tool_use`/`tool_result` blocks.
3. **Hover card scrollbar** — a visible scrollbar appears at the bottom of citation hover cards (`max-h-[400px] overflow-y-auto` on the inner wrapper div triggers a scroll container).
4. **Missing sources footer** — `usedDocuments: [{id, name}]` is already assembled in every `StructuredAnswer` response but never rendered. Users want a small "Sources: …" list at the bottom of each answer.
5. **Silent parse failures** — `parseCitationResponse` and the route catch block swallow errors, showing a generic Polish error message with no server-side logging to diagnose the root cause.

## Architecture Context

### Pipeline
```
CaseChatPanel (client) → POST /api/legal-hub/cases/[id]/chat → Anthropic API
                       ← StructuredAnswer | ActionProposal
```

### Key Files
| File | Role |
|------|------|
| `prompts/case-chat-grounded.md` | System prompt controlling citation frequency |
| `lib/citation-assembler.js` | `parseCitationResponse` — JSON parse + span computation |
| `src/app/api/legal-hub/cases/[id]/chat/route.ts` | API route — orchestrates retrieval, Anthropic call, error handling |
| `src/components/legal-hub/case-chat-panel.tsx` | Chat UI — message state, history serialization, response routing |
| `src/components/legal-hub/citation-hover-card.tsx` | Hover card — CSS layout |
| `messages/en.json` / `messages/pl.json` | i18n — chat-related keys |

### Data Types
- **StructuredAnswer**: `{ answerText, annotations, citations, usedDocuments: {id, name}[], confidence, needsDisambiguation, parseError? }` — `usedDocuments` is populated but never rendered
- **ChatMessage** (client): `{ role, content, structuredAnswer?, actionProposal?, error? }` — history only serializes `content` (plain string)
- **History format issue**: Anthropic multi-turn API requires `tool_use` + `tool_result` block pairs for agent turns; current code sends plain strings, breaking context after action proposals

## Tasks

---

### Task 1 — Citation density: prompt tuning

**Goal:** Reduce the volume of underlined text by instructing Claude to cite only key factual claims (not every sentence) and capping at 3–5 citations per answer.

**Files to change:**
- `prompts/case-chat-grounded.md` — add selectivity constraint to the citation rules section

**What to change:**

In the "Zasady cytowania" section, add:
- Cite only specific, key factual claims — not general conclusions or summaries.
- Maximum 3–5 `[cit:X]` markers per answer.
- A sentence that consolidates multiple supporting chunks needs only one or two markers (the most directly relevant ones), not all of them.

**Success criteria:**
- When asking a factual question about a case document, the answer has at most 3–5 underlined segments, not the majority of the text.
- When asking about case metadata (from `[DANE SPRAWY]`), no citation markers appear (this is already in the prompt but should be reinforced).
- Existing tests in `tests/unit/citation-assembler.test.ts` continue to pass.

**Dependencies:** none

---

### Task 2 — Sources footer + limitedEvidence UI rework

**Goal:** Always display a small "Źródła / Sources:" list of document names at the bottom of each structured answer (in the space currently occupied only by the limited-evidence note). Keep the limited-evidence note alongside when `confidence === "low"`.

**Files to change:**
- `src/components/legal-hub/case-chat-panel.tsx` — render `usedDocuments` and conditionally `limitedEvidence`
- `messages/en.json` — add `LegalHub.chat.sources` key
- `messages/pl.json` — add Polish equivalent

**What to change:**

In `case-chat-panel.tsx`, replace the current block:
```tsx
{msg.structuredAnswer.confidence === "low" && (
  <p className="text-xs text-muted-foreground mt-2">
    {t('chat.limitedEvidence')}
  </p>
)}
```

With:
```tsx
{/* Sources list — always shown when documents were used */}
{msg.structuredAnswer.usedDocuments.length > 0 && (
  <p className="text-xs text-muted-foreground mt-2">
    {t('chat.sources')} {msg.structuredAnswer.usedDocuments.map(d => d.name).join(', ')}
  </p>
)}
{/* Limited evidence note */}
{msg.structuredAnswer.confidence === "low" && (
  <p className="text-xs text-muted-foreground mt-1">
    {t('chat.limitedEvidence')}
  </p>
)}
```

i18n keys to add:
- `en.json`: `"sources": "Sources:"`
- `pl.json`: `"sources": "Źródła:"`

**Success criteria:**
- After asking a document-grounded question, the answer bubble shows "Źródła: document-name.pdf" as small muted text below the answer.
- When `confidence === "low"`, both the sources list (if any) and the limited-evidence note are visible.
- When no documents are referenced (e.g., metadata-only answer), no sources line appears.

**Dependencies:** none

---

### Task 3 — Hover card scrollbar fix

**Goal:** Eliminate the visible scrollbar inside citation hover cards. Cards should size naturally to their content.

**Files to change:**
- `src/components/legal-hub/citation-hover-card.tsx` — remove inner scrollable wrapper

**What to change:**

Remove the `<div className="max-h-[400px] overflow-y-auto">` wrapper and render citations directly inside `HoverCard.Content`. The `HoverCard.Content` is already constrained to `max-w-[360px]`; Radix handles viewport collision avoidance via `avoidCollisions`.

```tsx
// Before
<HoverCard.Content ...>
  <div className="max-h-[400px] overflow-y-auto">
    {citations.map(...)}
  </div>
  <HoverCard.Arrow ... />
</HoverCard.Content>

// After
<HoverCard.Content ...>
  {citations.map(...)}
  <HoverCard.Arrow ... />
</HoverCard.Content>
```

**Success criteria:**
- Hovering over an annotated citation segment shows the hover card with no scrollbar.
- Hover card height fits the citation content naturally.
- Multiple citations in one hover card (stacked with Separator) are all visible without scrolling.

**Dependencies:** none

---

### Task 4 — History fix + parse error logging

**Goal:**
1. Fix conversation history so that action-proposal turns (tool_use) are excluded from the serialized history sent to the Anthropic API (avoiding malformed multi-turn messages).
2. Add server-side logging of the raw Claude output when `parseCitationResponse` fails, so the root cause is visible in server logs.

**Files to change:**
- `src/components/legal-hub/case-chat-panel.tsx` — filter action-proposal messages from history
- `lib/citation-assembler.js` — add `console.error` with raw text on JSON parse failure
- `src/app/api/legal-hub/cases/[id]/chat/route.ts` — add `console.error` with error details in catch block

**What to change:**

**A — History fix** (`case-chat-panel.tsx`):
```ts
// Before
const history = previousMessages.map((m) => ({
  role: m.role,
  content: m.content,
}));

// After
const history = previousMessages
  .filter((m) => !m.actionProposal)   // exclude tool_use turns — they can't be serialized as plain strings
  .map((m) => ({
    role: m.role,
    content: m.content,
  }));
```

**B — Parse error logging** (`citation-assembler.js`):
In `parseCitationResponse`, before `return degraded`:
```js
try {
  parsed = JSON.parse(cleaned);
} catch (e) {
  console.error('[citation-assembler] JSON parse failed:', e.message, '| raw (first 500):', rawText.substring(0, 500));
  return degraded;
}
```

**C — Route catch logging** (`chat/route.ts`):
```ts
} catch (err: unknown) {
  console.error("[chat/route] Unhandled error:", err);
  return NextResponse.json({ ... parseError: true });
}
```

**Success criteria:**
- After an action-proposal turn (e.g., "add party: Jan Kowalski"), the next question in the conversation is answered with full context of previous Q&A turns (not confused by malformed tool_use history).
- When a parse failure occurs, the server log (Railway/console) shows the raw Claude output that failed to parse, including the error message.
- No regressions in the action-proposal flow (propose → confirm → apply still works).
- Existing `citation-assembler.test.ts` tests pass.

**Dependencies:** none (independent of other tasks)

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Prompt tuning reduces citations too aggressively — Claude stops citing at all | Low | The instruction says "max 3–5", not zero; model should still cite key claims |
| Removing hover card max-height causes card to overflow viewport | Low | Radix `avoidCollisions` repositions the card; single-citation cards are short |
| Filtering action-proposal turns from history loses mutation context | Medium | Acceptable trade-off — plain Q&A context is preserved; mutations are already applied to DB |
| Parse error logging exposes sensitive data in logs | Low | Only logging first 500 chars of Claude's response text, not user input or case data |

## Out of Scope

- Persisting chat history across page refreshes / sessions (no DB storage for messages)
- Properly reconstructing full `tool_use`/`tool_result` history blocks (complex, deferred)
- Streaming responses
- `needsDisambiguation` flow (always false, no UI path exists)
