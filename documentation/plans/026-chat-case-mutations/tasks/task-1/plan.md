# Task 1 Plan — Backend: Tool_use in Chat Route + Apply Endpoint

## Overview

Add tool_use capability to the case chat route so Claude can propose structured case mutations, and create an apply endpoint to execute confirmed actions.

## Changes

### 1. `src/app/api/legal-hub/cases/[id]/chat/route.ts`

**Remove prefilled assistant turn:**
- Delete `{ role: "assistant", content: "{" }` from the messages array (line 129)
- Remove the `"{" +` prefix from rawText construction (line 134)

**Add 5 tool definitions to the Claude API call:**
- `updateCaseMetadata` — court, reference_number, internal_number, judge, case_type, procedure_type, court_division, summary, claim_description, claim_value (number), claim_currency
- `addParty` — name (required), party_type (required, enum), address, representative_name, representative_address, representative_type, notes
- `updateParty` — party_id (required, number), name, address, representative_name, representative_address, representative_type, notes
- `addDeadline` — title (required), deadline_type (required, enum), due_date (required, ISO YYYY-MM-DD), description
- `updateCaseStatus` — status (required, enum), note

**Add `tool_choice: { type: "auto" }` to messages.create call.**

**Response handling — branch on stop_reason:**
- `stop_reason === "tool_use"`: Extract tool_use blocks from `genResponse.content`. Build text from any text blocks for `proposalText`. Return `ActionProposal` JSON:
  ```json
  {
    "type": "action_proposal",
    "proposalText": "...",
    "actions": [{ "tool": "...", "params": {...}, "label": "..." }]
  }
  ```
- `stop_reason === "end_turn"`: Existing StructuredAnswer path. Extract text from text blocks (no "{" prefix anymore). Parse with `parseCitationResponse`.
- `stop_reason === "max_tokens"`: Existing truncation fallback (unchanged).

**Update `buildStructuredContext` — include party IDs:**
- Change `formatPartiesContext` to include `ID: {p.id}` in each party's formatted block so Claude can reference party IDs for updateParty calls.

### 2. `src/app/api/legal-hub/cases/[id]/actions/apply/route.ts` (NEW)

POST handler following the same pattern as existing case routes (parties/route.ts, deadlines/route.ts):
- Auth check via `auth()` — return 401 if no session
- `ensureDb()` call
- Parse caseId from URL params, validate
- Parse body: `{ actions: Array<{ tool: string, params: object }> }`
- Validate actions array exists and is non-empty
- Process each action in a loop with try/catch per action:
  - `updateCaseMetadata` → `updateLegalCase(caseId, params)`
  - `addParty` → `addCaseParty({ caseId, partyType: params.party_type, name: params.name, address, representativeName, representativeAddress, representativeType, notes })`
  - `updateParty` → `updateCaseParty(params.party_id, { name, address, representativeName, representativeAddress, representativeType, notes })` — strip party_id, map snake_case to camelCase
  - `addDeadline` → `addCaseDeadline({ caseId, title, deadlineType: params.deadline_type, dueDate: params.due_date, description })`
  - `updateCaseStatus` → `updateLegalCase(caseId, { status: params.status })` + if note, parse existing `status_history_json`, append `{ status, note, date: new Date().toISOString() }`, save back
  - Unknown tool → push to errors[]
- `logAction("legal_case", caseId, "ai_mutation", { tool, params })` for each applied action
- Return `{ applied: string[], errors: string[] }`

Imports: `auth` from `@/auth`, `ensureDb` from `@/lib/server-utils`, DB helpers from `@/lib/db-imports`, `logAction` from `@/lib/audit-imports`.

### 3. `prompts/case-chat-grounded.md`

Add a new section at the top (before existing content) with tool usage instructions:

```
## Tryb działania

Masz dostęp do narzędzi umożliwiających modyfikację danych sprawy. Wybierz odpowiedni tryb:

### Gdy użytkownik prosi o DODANIE lub ZMIANĘ danych sprawy:
Użyj dostępnych narzędzi (tools). Przykłady:
- "dodaj stronę: Jan Kowalski, powód" → użyj addParty
- "dodaj termin: rozprawa 21.03.2026" → użyj addDeadline
- "zmień sąd na Sąd Okręgowy w Krakowie" → użyj updateCaseMetadata
- "zmień status na zamknięta" → użyj updateCaseStatus
- "uzupełnij dane sprawy z pozwu" → użyj narzędzi z wartościami wyekstrahowanymi z [DOKUMENTY SPRAWY]

### Gdy użytkownik zadaje PYTANIE lub prosi o ANALIZĘ:
Odpowiedz tekstem w formacie JSON {answerText, citations}. Przykłady:
- "jaka jest wartość przedmiotu sporu?" → odpowiedz JSON
- "podsumuj dokumenty" → odpowiedz JSON
- "kto jest pełnomocnikiem powoda?" → odpowiedz JSON

### Ważne zasady dla narzędzi:
- Dla updateParty: ID strony znajduje się w [DANE SPRAWY] przy każdej stronie.
- Dla ekstrakcji z dokumentów: wyciągnij wartości z [DOKUMENTY SPRAWY] i użyj narzędzi.
- Każde wywołanie narzędzia powinno zawierać label opisujący akcję po polsku.

### Ważne zasady dla odpowiedzi tekstowych:
- Zawsze zwracaj kompletny, poprawny JSON: {"answerText": "...", "citations": {...}}
- Nie polegaj na żadnym prefixie — JSON musi być kompletny od { do }.
```

## Risks & Mitigations

1. **JSON parsing without prefill**: System prompt explicitly instructs complete JSON output. Fallback on parse error returns degraded answer.
2. **Tool over-use**: Clear separation in prompt between mutation intent (tools) and information intent (text).
3. **Party ID availability**: `buildStructuredContext` will include IDs.
4. **Partial apply failures**: Each action wrapped in try/catch; returns both applied[] and errors[].

## Testing Notes

- Existing 65+ tests must pass (no breaking changes to StructuredAnswer path)
- TypeScript must compile clean
- The apply endpoint follows exact same patterns as existing party/deadline routes
