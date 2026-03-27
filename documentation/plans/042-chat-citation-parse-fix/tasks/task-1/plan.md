# Task 1 — Implementation Plan

## Objective
Fix `parseCitationResponse` to robustly extract JSON from Claude responses regardless of preamble text, code fences, or other wrapping. Add `parseError` flag to degraded fallback. Harden system prompt.

## Files to Modify

### 1. `lib/citation-assembler.js` (modify)

**Change A — JSON extraction (lines 69-73):**
Replace the fragile code-fence regex stripping:
```js
const cleaned = rawText
  .replace(/^```json\s*/i, "")
  .replace(/^```\s*/i, "")
  .replace(/\s*```$/i, "")
  .trim();
```
With robust bracket extraction:
```js
const firstBrace = rawText.indexOf("{");
const lastBrace = rawText.lastIndexOf("}");
const cleaned =
  firstBrace >= 0 && lastBrace > firstBrace
    ? rawText.substring(firstBrace, lastBrace + 1)
    : rawText.trim();
```

**Change B — Degraded fallback (lines 58-65):**
Change `answerText: rawText` to `answerText: ""` and add `parseError: true`:
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

### 2. `lib/citation-assembler.d.ts` (modify)

Add `parseError?: boolean` to the `StructuredAnswer` interface after `needsDisambiguation`:
```ts
export interface StructuredAnswer {
  answerText: string;
  annotations: Annotation[];
  citations: CitationRecord[];
  usedDocuments: Array<{ id: number; name: string }>;
  confidence: "high" | "medium" | "low";
  needsDisambiguation: boolean;
  parseError?: boolean;
}
```

### 3. `prompts/case-chat-grounded.md` (modify)

Add new hardening line after the existing "TYLKO JSON" instruction on line 55. The line at 55 reads:
```
**Format odpowiedzi -- TYLKO JSON, bez markdown, bez preambuły:**
```
After line 56 (the instruction line following), insert:
```
Jesli napiszesz cokolwiek przed '{' lub po '}', odpowiedz zostanie odrzucona.
```

## Success Criteria Mapping
- Preamble before JSON: handled by `indexOf("{")` finding first brace past any preamble
- Bare JSON: `indexOf("{")` returns 0, extracts full object -- same as before
- Code-fenced JSON: `indexOf("{")` finds the brace inside the fence, `lastIndexOf("}")` finds closing -- works correctly
- Degraded fallback: `answerText: ""` and `parseError: true` -- never exposes raw text
- Prompt hardening: new line added after "TYLKO JSON" instruction
- TypeScript: `parseError?: boolean` is optional, won't break existing consumers

## Risks
- None significant. The bracket extraction is strictly more permissive than the regex approach. Any input that parsed before will still parse. The only theoretical risk is if Claude returns multiple top-level JSON objects, but the prompt instructs a single object and the existing contract expects one.
