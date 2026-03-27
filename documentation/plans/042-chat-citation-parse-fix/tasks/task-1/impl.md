# Task 1 Complete — Robust JSON extraction + prompt hardening

## Changes

- **Modified:** `lib/citation-assembler.js` (lines 58-76)
  - Replaced fragile code-fence regex stripping (3 chained `.replace()` calls) with bracket extraction: `rawText.indexOf("{")` to `rawText.lastIndexOf("}")` via `substring`
  - Changed degraded fallback: `answerText: rawText` -> `answerText: ""`, added `parseError: true`
- **Modified:** `lib/citation-assembler.d.ts` (line 26)
  - Added `parseError?: boolean` to `StructuredAnswer` interface
- **Modified:** `prompts/case-chat-grounded.md` (line 57)
  - Added hardening line after "TYLKO JSON" instruction: "Jesli napiszesz cokolwiek przed '{' lub po '}', odpowiedz zostanie odrzucona."

## Verification

- TypeScript compilation: clean (no errors)
- Bracket extraction handles all three input variants:
  - Bare JSON: `indexOf("{")` returns 0, full object extracted
  - Code-fenced JSON: `indexOf("{")` finds brace inside fence, `lastIndexOf("}")` finds closing brace
  - Preamble + JSON: `indexOf("{")` skips preamble text, extracts JSON object

## INTEGRATION

- Task 2 depends on `parseError?: boolean` in `StructuredAnswer` (now available in `lib/citation-assembler.d.ts`)
- Task 2 should check `data.parseError` in `case-chat-panel.tsx` and render translated error message
- The `parseError` flag flows through `chat/route.ts` automatically via `NextResponse.json(structured)`
