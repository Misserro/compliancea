# Plan 026 — Chat-Driven Case Mutations

**Status:** Draft
**Module:** Legal Hub — Case Chat (Agentic Actions)
**Depends on:** Plans 024 (unified retrieval) and 025 (citation UI)

---

## Problem Statement

The case chat is entirely read-only. Lawyers want to use natural language to mutate case data — both via explicit commands ("add hearing on 21.03.2026") and document-driven extraction ("fill case details from the writ"). Any AI-proposed change must be shown as a confirmation card before being applied to prevent accidental data corruption.

---

## Goal

Add tool_use capability to the case chat so Claude can propose structured mutations (case metadata, parties, deadlines, status) which the user reviews and confirms before they are applied to the database.

---

## Architecture

```
User message
    ↓
Chat route — Claude call WITH tools defined (5 tools)
    ↓
Claude returns:
  ├── text block → existing StructuredAnswer path (unchanged)
  └── tool_use blocks → ActionProposal response
        ↓
Frontend renders ProposalCard (proposed changes + Confirm/Cancel)
        ↓
User confirms → POST /api/legal-hub/cases/[id]/actions/apply
        ↓
Apply endpoint → calls existing mutation APIs
        ↓
Chat panel shows confirmation + router.refresh() reloads case data
```

---

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Confirmation model | Propose → Confirm → Apply | Legal data safety; user chose this |
| Tool trigger | Claude tool_use blocks | Structured, validated; no free-form parsing |
| Document extraction | Via existing retrieval context | Document chunks already in [DOKUMENTY SPRAWY]; Claude extracts and calls tools |
| Prefill removal | Remove `{ role: "assistant", content: "{" }` | Incompatible with tool_use |
| Parent refresh | `router.refresh()` on client after apply | Next.js 15 re-fetches server component data |
| Status endpoint | Extend PATCH case allowlist to include `status` | Simplest; existing PATCH handler handles it |

---

## Tools Defined (5)

```typescript
updateCaseMetadata({
  court?, reference_number?, internal_number?, judge?, case_type?,
  procedure_type?, court_division?, summary?, claim_description?,
  claim_value?: number, claim_currency?
})

addParty({
  name: string,
  party_type: "plaintiff" | "defendant" | "third_party" | "witness" | "other",
  address?: string,
  representative_name?: string,
  representative_address?: string,
  representative_type?: string,
  notes?: string
})

updateParty({
  party_id: number,
  name?, address?, representative_name?, representative_address?,
  representative_type?, notes?
})

addDeadline({
  title: string,
  deadline_type: "hearing" | "response_deadline" | "appeal_deadline" |
                 "filing_deadline" | "payment" | "other",
  due_date: string,   // ISO date YYYY-MM-DD
  description?: string
})

updateCaseStatus({
  status: string,   // one of valid case statuses
  note?: string     // shown in status history
})
```

---

## New Response Shape: ActionProposal

When Claude calls tools (instead of answering), the chat route returns:

```json
{
  "type": "action_proposal",
  "proposalText": "Na podstawie wezwania do zapłaty proponuję następujące uzupełnienie danych sprawy:",
  "actions": [
    {
      "tool": "updateCaseMetadata",
      "params": { "court": "Sąd Okręgowy w Warszawie", "reference_number": "XXC 123/26" },
      "label": "Aktualizacja danych sprawy: sąd i sygnatura"
    },
    {
      "tool": "addDeadline",
      "params": { "title": "Rozprawa", "deadline_type": "hearing", "due_date": "2026-03-21" },
      "label": "Dodanie terminu: Rozprawa 21.03.2026"
    }
  ]
}
```

The `StructuredAnswer` path remains unchanged for regular Q&A responses.

---

## Documentation Updates (Stage 4 Step 1)

None required — this is a new feature without conflicting architecture docs.

---

## Implementation Tasks

### Task 1 — Backend: Tool_use in Chat Route + Apply Endpoint

**Scope:** Extend the chat route to support tool_use, add the apply endpoint, extend case status endpoint.

**Files to create or modify:**

**`src/app/api/legal-hub/cases/[id]/route.ts`** — Extend PATCH allowlist:
- Add `status` to the allowed fields list in the PATCH handler
- Keep the same pattern (field-by-field allowlist, JSON.stringify for array/object fields)

**`src/app/api/legal-hub/cases/[id]/actions/apply/route.ts`** — New endpoint:
- POST handler: accepts `{ actions: ActionItem[] }` where each ActionItem is `{ tool: string, params: object }`
- Validates `caseId` from URL and session (auth check)
- Dispatches each action to the appropriate mutation:
  - `updateCaseMetadata` → call `updateLegalCase(caseId, params)` directly from db-imports
  - `addParty` → call `addCaseParty({ caseId, ...params })`
  - `updateParty` → call `updateCaseParty(params.party_id, params)` (strip party_id from params before update)
  - `addDeadline` → call `addCaseDeadline({ caseId, ...params })`
  - `updateCaseStatus` → call `updateLegalCase(caseId, { status: params.status })` + append to `status_history_json`
- Returns `{ applied: string[], errors: string[] }` (applies as many as possible, reports failures)
- Log each applied action to audit log

**`src/app/api/legal-hub/cases/[id]/chat/route.ts`** — Extend:
- Remove the prefilled assistant turn (`{ role: "assistant", content: "{" }`)
- Add `tools` parameter to the Claude messages.create call (5 tool definitions)
- Add `tool_choice: "auto"` — let Claude decide whether to answer or act
- After Claude responds: check if `genResponse.content` contains any `tool_use` blocks
- If tool_use blocks found: build and return `ActionProposal` JSON
- If text blocks only: existing StructuredAnswer parse path (unchanged, but without prefill)
- Update system prompt instructions (new section in `prompts/case-chat-grounded.md`):
  - When to use tools vs. when to answer in text
  - Propose tools when user requests data creation, modification, or document extraction
  - Respond with JSON text for questions, analysis, and information retrieval
  - Format: for text responses, always output valid JSON with answerText and citations keys
- Update `buildStructuredContext` to include party IDs in the formatted context (needed for `updateParty` tool calls)

**`prompts/case-chat-grounded.md`** — Add tool usage instructions section:
- Instructs Claude when to use tools (mutation intent) vs. when to answer (information intent)
- Lists available tools with brief descriptions
- For document extraction: instruct Claude to use tools with extracted values from the evidence blocks
- For regular answers: continue to output JSON `{answerText, citations}` format

**Success criteria (user-visible):**
- Saying "dodaj termin: rozprawa 21.03.2026" → chat shows a proposal card (not just text answer) with "Add deadline: hearing 21.03.2026" + Confirm/Cancel buttons
- Saying "fill case details from [document name]" → chat shows a proposal card with extracted fields (court, parties, etc.) from the document + Confirm/Cancel
- Regular questions ("what is the claim value?") still return normal answers with no proposal card
- Confirming a proposal writes to the DB and the case detail fields update on refresh
- Rejecting a proposal writes nothing
- Anthropic API is called only once per chat message (not two separate calls)
- TypeScript compiles clean, existing tests pass

---

### Task 2 — Frontend: ProposalCard + Confirm/Apply Flow

**Scope:** Render action proposals in the chat, handle confirm/cancel, trigger refresh.

**Files to create or modify:**

**`src/components/legal-hub/action-proposal-card.tsx`** — New component:
- Props: `proposal: ActionProposal`, `caseId: number`, `onApplied: () => void`, `onRejected: () => void`
- Renders: `proposalText` paragraph, then a styled list of proposed actions (each `action.label` as a bullet), then Confirm and Cancel buttons
- State: `loading: boolean`, `error: string | null`, `applied: boolean`
- On Confirm: POST to `/api/legal-hub/cases/${caseId}/actions/apply` with `{ actions: proposal.actions }`
- On success: show confirmation message ("Zmiany zostały zastosowane"), call `onApplied()`
- On error: show error message inline, keep Confirm/Cancel available for retry
- On Cancel: call `onRejected()`
- Design: card with border, subtle background (muted), professional — not a celebration modal
- No emoji, no big success animations

**`src/components/legal-hub/case-chat-panel.tsx`** — Update:
- Add `ActionProposal` type guard: `isActionProposal(data)` — checks `data.type === "action_proposal" && Array.isArray(data.actions)`
- Update `ChatMessage` type: add `actionProposal?: ActionProposal | null`
- In the API response handler: after `isStructuredAnswer` check, add `isActionProposal` check
- If action proposal: store `actionProposal` on the assistant message, set `content` to `proposal.proposalText`
- Add rendering branch for `msg.actionProposal`: render `<ActionProposalCard>`
- Pass `onApplied` callback that calls `router.refresh()` to reload case data
- Import `useRouter` from `next/navigation`

**Success criteria (user-visible):**
- Chat messages showing action proposals render as styled cards with proposed changes listed
- Confirm button applies the changes and shows inline confirmation; case data updates when user looks at other tabs
- Cancel button dismisses without writing anything; a cancellation note appears in the chat
- Loading state shown on Confirm button while apply is in progress
- If apply fails (validation error from API), error shown inline with option to retry
- Existing Q&A messages with citations are unaffected — no regression

---

## Task Dependencies

Task 1 (backend) must complete before Task 2 (frontend). Task 2 can be pipeline-spawned for planning while Task 1 is in review/test.

---

## Key Files Changed

| File | Change |
|---|---|
| `src/app/api/legal-hub/cases/[id]/route.ts` | Extend PATCH allowlist with `status` |
| `src/app/api/legal-hub/cases/[id]/actions/apply/route.ts` | New — apply confirmed actions |
| `src/app/api/legal-hub/cases/[id]/chat/route.ts` | Add tool_use support, remove prefill, ActionProposal response |
| `prompts/case-chat-grounded.md` | Add tool usage instructions |
| `src/components/legal-hub/action-proposal-card.tsx` | New — proposal render + confirm/cancel |
| `src/components/legal-hub/case-chat-panel.tsx` | Detect ActionProposal, render card, trigger refresh |

---

## Risks

| Risk | Mitigation |
|---|---|
| Removing prefill reduces JSON output reliability | System prompt explicitly instructs JSON format for text responses; parse errors fall back to degraded answer |
| Claude over-uses tools (proposes mutations for informational questions) | System prompt clearly distinguishes mutation intent vs. information intent; tested in acceptance |
| `updateParty` requires party_id Claude must know | `buildStructuredContext` includes party IDs in the [DANE SPRAWY] block |
| Apply endpoint partial failures (some actions succeed, some fail) | Returns `{ applied[], errors[] }`; shows partial success in confirmation |
| Status history requires append logic | updateCaseStatus parses existing `status_history_json`, appends new entry, saves back |

---

- [ ] Task 1: Backend — Tool_use in Chat Route + Apply Endpoint
- [ ] Task 2: Frontend — ProposalCard + Confirm/Apply Flow
